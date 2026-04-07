// ===========================================================================
// IMPORTS -- these are pre-filled for you
// ===========================================================================
use aztec::macros::aztec;

pub mod types;

#[aztec]
pub contract DvPEscrowStub {
    use aztec::{
        macros::{
            functions::{initializer, external},
            storage::storage
        },
        messages::message_delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::SinglePrivateImmutable
    };
    use token_contract::Token;
    use private_bonds::PrivateBonds;
    use crate::types::config_note::ConfigNote;


    // ===========================================================================
    // STORAGE -- pre-filled for you
    //
    // SinglePrivateImmutable means: one private note, written once, never
    // modified. Perfect for storing deal config that both parties reference.
    // ===========================================================================
    #[storage]
    struct Storage<Context> {
        config: SinglePrivateImmutable<ConfigNote, Context>,
    }


    // ===========================================================================
    // CONSTRUCTOR -- called once when the escrow is deployed (by the buyer)
    // ===========================================================================
    //
    // The buyer deploys this contract specifying:
    //   - which bond they want to buy and how many
    //   - which token they'll pay with and how much
    //
    // The constructor sets up the "deal terms" as an immutable private note.
    //
    #[external("private")]
    #[initializer]
    fn constructor(
        bond_address: AztecAddress,
        bond_amount: u128,
        payment_token_address: AztecAddress,
        payment_amount: u128,
    ) {
        // -------------------------------------------------------------------
        // CONCEPT: Partial Notes
        //
        // A partial note is a "promise" of a future token transfer. When the
        // buyer deploys the escrow, we don't know yet if the deal will go
        // through -- but we need to set up the payment path NOW so it can
        // happen atomically later.
        //
        // initialize_transfer_commitment() creates a cryptographic
        // commitment: "tokens WILL flow from buyer -> seller when finalized."
        // It returns a Field (the commitment hash) that we store in config.
        //
        // Later, in settle(), we call transfer_private_to_commitment() to
        // "finalize" this partial note -- actually moving the tokens.
        //
        // WHY: This two-step pattern enables atomic DvP. The seller can
        // verify the commitment exists before locking their bonds, knowing
        // that settlement will pay them automatically.
        // -------------------------------------------------------------------

        // Step 1: Create a partial note for the payment token
        //
        //   Call Token::at(payment_token_address).initialize_transfer_commitment(...)
        //   passing the buyer (self.msg_sender()) and the escrow (self.address)
        //   Use self.call(...) to make the cross-contract call
        //   Store the result in `partial_note`
        //
        //   Hint: let partial_note = self.call(Token::at(payment_token_address)
        //             .initialize_transfer_commitment(self.msg_sender(), self.address));


        // Step 2: Create a ConfigNote with all deal parameters
        //
        //   Call ConfigNote::new(...) with:
        //     - self.address (the escrow is the note owner)
        //     - partial_note (from step 1)
        //     - bond_address, bond_amount
        //     - payment_token_address, payment_amount
        //
        //   Hint: let config = ConfigNote::new(
        //             self.address, partial_note,
        //             bond_address, bond_amount,
        //             payment_token_address, payment_amount);


        // -------------------------------------------------------------------
        // CONCEPT: Note Delivery (How private data reaches other parties)
        //
        // Private notes live in an encrypted tree -- but someone needs to
        // know where to find them! `initialize()` stores the note, and
        // `deliver(MessageDelivery.ONCHAIN_CONSTRAINED)` ensures the note
        // commitment is posted on-chain so other participants can discover
        // and decrypt it.
        //
        // "Constrained" means the delivery is verified by the protocol --
        // you can't lie about what note you delivered.
        // -------------------------------------------------------------------

        // Step 3: Initialize storage and deliver the note
        //
        //   Use self.storage.config.initialize(config)
        //   Chain .deliver(MessageDelivery.ONCHAIN_CONSTRAINED) to publish it
        //
        //   Hint: self.storage.config
        //             .initialize(config)
        //             .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);
    }


    // ===========================================================================
    // LOCK_DELIVERY -- the seller deposits their bonds into escrow
    // ===========================================================================
    //
    // After the buyer has deployed the escrow, the seller calls this function
    // to lock their bonds. This is the "delivery" side of Delivery vs Payment.
    //
    #[external("private")]
    fn lock_delivery(_nonce: Field) {

        // Step 1: Read the config note from storage
        //
        //   Hint: let config = self.storage.config.get_note();


        // -------------------------------------------------------------------
        // CONCEPT: Authorization Witnesses (Authwits)
        //
        // In Aztec, you can't just move someone else's tokens -- even from a
        // smart contract. The token owner must explicitly authorize the
        // action by creating an "authwit" (authorization witness) before the
        // contract call.
        //
        // Think of it like ERC-20 approve() but privacy-preserving. The
        // seller creates an authwit off-chain saying "I allow this escrow
        // contract to transfer X bonds from me." Then transfer_from checks
        // this authwit exists before moving the tokens.
        //
        // WHY: Without authwits, any contract could drain your tokens!
        // Authwits ensure the owner maintains control and explicitly opts in
        // to each transfer.
        // -------------------------------------------------------------------

        // Step 2: Transfer bonds from seller to escrow
        //
        //   Call PrivateBonds::at(config.bond_address).transfer_from(...)
        //   passing: caller (self.msg_sender()), escrow (self.address),
        //            config.bond_amount, and _nonce
        //   Use self.call(...) for cross-contract calls
        //
        //   Hint: self.call(PrivateBonds::at(config.bond_address)
        //             .transfer_from(caller, self.address, config.bond_amount, _nonce));


        // -------------------------------------------------------------------
        // CONCEPT: Nullifiers (Preventing double-actions)
        //
        // A nullifier is a unique hash pushed into a global set. If you try
        // to push the same nullifier twice, the transaction is rejected.
        //
        // WHY: Without a deposit nullifier, a malicious seller could call
        // lock_delivery multiple times, potentially disrupting settlement.
        // The nullifier acts as a "used ticket" -- once emitted, the deposit
        // phase is permanently closed.
        //
        // We compute the nullifier from the config note contents + a
        // boolean flag (true = deposit phase) via Poseidon2 hashing.
        // -------------------------------------------------------------------

        // Step 3: Emit a deposit nullifier to prevent double-deposits
        //
        //   Get the nullifier: config.get_nullifier(true)  -- true = deposit phase
        //   Push it: self.context.push_nullifier(deposit_nullifier)
        //
        //   Hint: let deposit_nullifier = self.storage.config.get_note().get_nullifier(true);
        //         self.context.push_nullifier(deposit_nullifier);
    }


    // ===========================================================================
    // SETTLE -- the buyer pays and receives bonds (atomic swap!)
    // ===========================================================================
    //
    // This is where the magic happens. In one atomic transaction:
    //   1. Buyer's payment tokens are transferred to the escrow
    //   2. The partial note is finalized -- sending payment to the seller
    //   3. Bonds move from escrow to buyer
    //
    // If any step fails, the entire transaction reverts. This is DvP!
    //
    #[external("private")]
    fn settle(_nonce: Field) {

        // Step 1: Read the config note from storage
        //
        //   Hint: let config = self.storage.config.get_note();


        // Step 2: Transfer payment tokens from buyer to escrow
        //
        //   Call Token::at(config.payment_token_address)
        //       .transfer_private_to_private(...)
        //   passing: caller, escrow, payment_amount, _nonce
        //
        //   Hint: self.call(Token::at(config.payment_token_address)
        //             .transfer_private_to_private(
        //                 caller, self.address, config.payment_amount, _nonce));


        // Step 3: Finalize the partial note -- buyer's payment goes to the seller
        //
        //   This "completes" the partial note created in the constructor.
        //   Call Token::at(config.payment_token_address)
        //       .transfer_private_to_commitment(...)
        //   passing: escrow (self.address), config.partial_note,
        //            config.payment_amount, 0 (nonce)
        //
        //   Hint: self.call(Token::at(config.payment_token_address)
        //             .transfer_private_to_commitment(
        //                 self.address, config.partial_note,
        //                 config.payment_amount, 0));


        // Step 4: Transfer bonds from escrow to buyer + emit fill nullifier
        //
        //   a) Transfer bonds: PrivateBonds::at(config.bond_address)
        //          .transfer_from(escrow, caller, bond_amount, 0)
        //
        //   b) Emit fill nullifier: config.get_nullifier(false) -- false = fill phase
        //      Push it with self.context.push_nullifier(...)
        //
        //   Hint:
        //     self.call(PrivateBonds::at(config.bond_address)
        //         .transfer_from(self.address, caller, config.bond_amount, 0));
        //     let fill_nullifier = config.get_nullifier(false);
        //     self.context.push_nullifier(fill_nullifier);
    }


    // ===========================================================================
    // GET_CONFIG -- read-only view of the deal parameters
    // ===========================================================================

    // -------------------------------------------------------------------
    // CONCEPT: Unconstrained Functions
    //
    // An unconstrained function runs outside the ZK circuit -- it's like a
    // "free" read that doesn't cost gas or generate a proof. Use these for
    // view/query operations where you just need to peek at private state.
    //
    // The #[external("utility")] + unconstrained keywords together mark
    // this as a utility function that clients can call to inspect state.
    // -------------------------------------------------------------------

    // Step 1: Implement get_config
    //
    //   Use self.storage.config.view_note() to read the config note
    //   This is a simple one-liner!
    //
    //   Hint: #[external("utility")]
    //         unconstrained fn get_config() -> ConfigNote {
    //             self.storage.config.view_note()
    //         }
}
