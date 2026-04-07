use aztec::macros::aztec;

#[aztec]
pub contract PrivateBonds {
    use aztec::{
        macros::{functions::{authorize_once, external, initializer, only_self}, storage::storage},
        oracle::get_contract_instance::get_contract_instance,
        protocol::{
            address::AztecAddress,
            contract_class_id::ContractClassId,
            contract_instance::ContractInstance,
            traits::FromField,
        },
        state_vars::{Map, Owned, PublicImmutable, PublicMutable},
    };
    use aztec::macros::events::event;
    use aztec::messages::message_delivery::MessageDelivery;
    use aztec::test::helpers::test_environment::TestEnvironment;
    use balance_set::BalanceSet;
    use token_contract::Token;

    #[event]
    struct TransferEvent {
        from: AztecAddress,
        to: AztecAddress,
        amount: u128,
    }

    #[storage]
    struct Storage<Context> {
        issuer: PublicImmutable<AztecAddress, Context>,
        private_balances: Owned<BalanceSet<Context>, Context>,
        whitelist: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        total_supply: PublicMutable<u128, Context>,
        maturity_date: PublicMutable<u64, Context>,
        payment_token: PublicImmutable<AztecAddress, Context>,
        trusted_escrow_class_id: PublicImmutable<Field, Context>,
        name: PublicImmutable<Field, Context>,
    }

    #[initializer]
    #[external("private")]
    fn constructor(name: Field, total_supply: u128, maturity: u64, payment_token: AztecAddress, trusted_escrow_class_id: Field) {
        let issuer = self.msg_sender();

        // Set public state via enqueued calls
        self.enqueue_self._set_immutables(issuer, name, total_supply, maturity, payment_token, trusted_escrow_class_id);

        // Mint entire supply to issuer's private balance
        // This is the ONLY minting that ever happens
        self.storage.private_balances.at(issuer).add(total_supply).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("public")]
    #[only_self]
    fn _set_immutables(
        issuer: AztecAddress,
        name: Field,
        total_supply: u128,
        maturity: u64,
        payment_token: AztecAddress,
        trusted_escrow_class_id: Field,
    ) {
        self.storage.issuer.initialize(issuer);
        self.storage.name.initialize(name);
        self.storage.total_supply.write(total_supply);
        self.storage.maturity_date.write(maturity);
        self.storage.payment_token.initialize(payment_token);
        self.storage.trusted_escrow_class_id.initialize(trusted_escrow_class_id);
    }

    #[external("public")]
    fn add_to_whitelist(investor: AztecAddress) {
        assert_eq(
            self.msg_sender(),
            self.storage.issuer.read(),
            "Only issuer can manage whitelist",
        );
        assert(!self.storage.whitelist.at(investor).read(), "Investor is already listed");

        self.storage.whitelist.at(investor).write(true);
    }

    #[external("public")]
    fn ban_from_whitelist(investor: AztecAddress) {
        assert_eq(
            self.msg_sender(),
            self.storage.issuer.read(),
            "Only issuer can manage whitelist",
        );
        assert(self.storage.whitelist.at(investor).read(), "Investor is already unlisted");

        self.storage.whitelist.at(investor).write(false);
    }

    #[external("private")]
    fn distribute_private(investor: AztecAddress, amount: u128) {
        // Only issuer can distribute
        self.enqueue_self._assert_is_issuer(self.msg_sender());

        // Check investor is whitelisted
        self.enqueue_self._assert_is_whitelisted(investor);

        // Transfer from issuer's private balance to investor
        let issuer = self.msg_sender();
        self.storage.private_balances.at(issuer).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.storage.private_balances.at(investor).add(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        let event_recipient = self.storage.issuer.read();
        self.emit(TransferEvent { from: issuer, to: investor, amount }).deliver_to(
            event_recipient,
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    fn transfer_private(to: AztecAddress, amount: u128) {
        let sender = self.msg_sender();

        // Check both sender and recipient are whitelisted
        self.enqueue_self._assert_is_whitelisted(sender);
        self.enqueue_self._assert_is_whitelisted(to);

        // Spend sender's notes
        self.storage.private_balances.at(sender).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Create new notes for recipient
        self.storage.private_balances.at(to).add(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        let issuer = self.storage.issuer.read();
        self.emit(TransferEvent { from: sender, to, amount }).deliver_to(
            issuer,
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    /// Delegated transfer for DvP and other authorized scenarios.
    /// Requires `from` to have created an authwit for this exact call.
    /// Trusted escrow contracts (verified by class ID) skip the whitelist check.
    #[authorize_once("from", "authwit_nonce")]
    #[external("private")]
    fn transfer_from(from: AztecAddress, to: AztecAddress, amount: u128, authwit_nonce: Field) {
        // Check if the caller (msg_sender) is a trusted escrow contract by class ID.
        // In DvP flows, the escrow contract calls transfer_from, so msg_sender is the escrow.
        // If the caller is a trusted escrow, skip whitelist checks for from/to since
        // the escrow enforces its own authorization via authwit.
        let stored_class_id: Field = self.storage.trusted_escrow_class_id.read();
        let caller = self.msg_sender();

        let mut caller_is_trusted_escrow = false;
        if stored_class_id != 0 {
            let caller_instance = get_contract_instance(caller);
            let verified = ContractInstance {
                salt: caller_instance.salt,
                deployer: caller_instance.deployer,
                contract_class_id: ContractClassId::from_field(stored_class_id),
                initialization_hash: caller_instance.initialization_hash,
                public_keys: caller_instance.public_keys,
            };
            caller_is_trusted_escrow = verified.to_address() == caller;
        }

        if !caller_is_trusted_escrow {
            self.enqueue_self._assert_is_whitelisted(from);
            self.enqueue_self._assert_is_whitelisted(to);
        }

        self.storage.private_balances.at(from).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
        self.storage.private_balances.at(to).add(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        let issuer = self.storage.issuer.read();
        self.emit(TransferEvent { from, to, amount }).deliver_to(
            issuer,
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    /// Redeem bonds at maturity. Burns bonds and pays out stablecoins 1:1 from
    /// the contract's public stablecoin balance to the investor's private balance.
    #[external("private")]
    fn redeem(amount: u128) {
        let investor = self.msg_sender();
        self.enqueue_self._assert_is_whitelisted(investor);
        self.enqueue_self._assert_maturity_reached();

        // Burn bonds from investor's private balance
        self.storage.private_balances.at(investor).sub(amount).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );

        // Create a partial note commitment for the stablecoin payout to the investor
        let payment_token_address = self.storage.payment_token.read();
        let commitment = self.call(Token::at(payment_token_address)
            .initialize_transfer_commitment(investor, self.address));

        // Enqueue public function to finalize the payout from contract's public balance
        self.enqueue_self._settle_redemption(commitment, amount);
    }

    /// Finalize redemption payout: transfer stablecoins from this contract's public
    /// balance to the investor's private balance via the commitment.
    #[external("public")]
    #[only_self]
    fn _settle_redemption(commitment: Field, amount: u128) {
        let payment_token_address = self.storage.payment_token.read();
        let payout = amount * 1000000; // 1 bond = 1 USDC (6 decimals)
        // from = self (bond contract), msg_sender = self (internal), so nonce=0 needs no authwit
        self.call(Token::at(payment_token_address)
            .transfer_public_to_commitment(
                self.address,
                commitment,
                payout,
                0,
            ));
    }

    #[external("utility")]
    unconstrained fn private_balance_of(owner: AztecAddress) -> pub u128 {
        self.storage.private_balances.at(owner).balance_of()
    }

    #[external("utility")]
    unconstrained fn get_name() -> pub Field {
        self.storage.name.read()
    }

    #[external("utility")]
    unconstrained fn get_total_supply() -> pub u128 {
        self.storage.total_supply.read()
    }

    #[external("utility")]
    unconstrained fn get_maturity_date() -> pub u64 {
        self.storage.maturity_date.read()
    }

    #[external("utility")]
    unconstrained fn is_whitelisted(address: AztecAddress) -> pub bool {
        self.storage.whitelist.at(address).read()
    }

    #[external("public")]
    #[only_self]
    fn _assert_is_issuer(address: AztecAddress) {
        assert_eq(address, self.storage.issuer.read(), "Only the Issuer can perform this action");
    }

    #[external("public")]
    #[only_self]
    fn _assert_is_whitelisted(address: AztecAddress) {
        assert(self.storage.whitelist.at(address).read(), "Address is not whitelisted");
    }

    #[external("public")]
    #[only_self]
    fn _assert_maturity_reached() {
        let block_timestamp = self.context.timestamp();
        let maturity_date = self.storage.maturity_date.read();
        assert(block_timestamp >= maturity_date, "Bond has not reached maturity yet");
    }

    #[test]
    unconstrained fn test_initialize_and_balance() {
        let mut env = TestEnvironment::new();
        let issuer = env.create_light_account();

        let bond_addr = env.deploy("PrivateBonds").with_private_initializer(
            issuer,
            PrivateBonds::interface().constructor(0, 1_000_000, 0, AztecAddress::zero(), 0),
        );

        let balance: u128 =
            env.execute_utility(PrivateBonds::at(bond_addr).private_balance_of(issuer));
        assert_eq(balance, 1_000_000);
    }

}
