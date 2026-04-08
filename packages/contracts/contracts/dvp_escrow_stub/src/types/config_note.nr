// ===========================================================================
// IMPORTS -- these are pre-filled for you
// ===========================================================================
use aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol::{
        traits::{Deserialize, Serialize, Packable},
        address::AztecAddress,
    },
};
use poseidon::poseidon2::Poseidon2;


// ---------------------------------------------------------------------------
// CONCEPT: What is a "Note" in Aztec?
//
// Notes are the fundamental unit of private state in Aztec. Think of them
// like encrypted UTXOs -- each note stores data that only the owner can
// read. Notes live in a private append-only tree, and are "consumed" by
// creating a nullifier (a unique hash that marks the note as spent without
// revealing which note it was).
//
// The #[note] macro auto-generates the serialization, hashing, and
// nullification logic needed for the Aztec protocol to manage this note.
//
// The #[derive(...)] macros give us:
//   - Eq: compare two notes for equality
//   - Serialize/Deserialize: convert to/from field arrays for storage
//   - Packable: efficient encoding for note commitments
// ---------------------------------------------------------------------------

// TODO: Fill in the field types for ConfigNote
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct ConfigNote {
    pub owner: ___,
    pub partial_note: ___,
    pub bond_address: ___,
    pub bond_amount: ___,
    pub payment_token_address: ___,
    pub payment_amount: ___,
    pub randomness: ___,
}

impl ConfigNote {

    // -- new() ------------------------------------------------------------
    // Creates a new ConfigNote with all deal parameters.
    //
    // Step 1: Accept all fields except `randomness` as parameters
    //         Parameters: owner, partial_note, bond_address, bond_amount,
    //                     payment_token_address, payment_amount
    //
    // Step 2: Generate randomness using Aztec's random oracle
    //         The `random()` oracle provides a random Field element at runtime.
    //         It must be called inside `unsafe { }` because oracles execute
    //         outside the circuit -- they are trusted but not proven.
    //         Randomness prevents observers from guessing note contents
    //         and finding your note in the commitment tree.
    //
    //         Hint: randomness: unsafe { random() }
    //
    // Step 3: Return Self { all_fields }
    pub fn new(
        owner: AztecAddress,
        partial_note: Field,
        bond_address: AztecAddress,
        bond_amount: u128,
        payment_token_address: AztecAddress,
        payment_amount: u128,
    ) -> Self {
        // TODO
    }


    // -- get_nullifier(deposit: bool) --------------------------------------
    // Computes a unique nullifier hash for this deal.
    //
    // WHY: The DvP escrow has two phases -- deposit (seller locks bonds)
    //      and fill (buyer pays and receives bonds). Each phase must
    //      happen exactly once. We use nullifiers to enforce this:
    //      emitting a nullifier is like "spending" a one-time ticket.
    //      If someone tries the same phase again, the duplicate nullifier
    //      is rejected by the protocol.
    //
    // The `deposit` boolean flag differentiates the two nullifiers so
    // the deposit-phase nullifier and fill-phase nullifier are distinct.
    //
    // Step 1: Serialize this note into a field array
    //         Hint: let serialized = self.serialize();
    //
    // Step 2: Append the deposit flag (as Field) to create the preimage
    //         Hint: let preimage = serialized.concat([deposit as Field]);
    //
    // Step 3: Hash with Poseidon2 to produce the nullifier
    //         Poseidon2 is a ZK-friendly hash function (efficient in circuits).
    //         The second arg is the number of fields to hash.
    //         Hint: Poseidon2::hash(preimage, 8)
    pub fn get_nullifier(self, deposit: bool) -> Field {
        // TODO
    }
}
