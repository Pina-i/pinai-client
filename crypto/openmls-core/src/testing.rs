//! What the test modules share.

use openmls::{
    credentials::{BasicCredential, CredentialWithKey},
    key_packages::Lifetime,
    messages::external_proposals::JoinProposal,
    prelude::LeafNodeParameters,
};
use openmls_rust_crypto::OpenMlsRustCrypto;
use openmls_traits::OpenMlsProvider;

use crate::wire::serialize_message;
use crate::{
    Group, Identity, IncomingGroupInfo, IncomingMessage, IncomingWelcome, KeyPackage, MlsError,
    ProcessedKind, ProcessedMessage, Provider, RatchetTree,
};

/// A fresh signature key bound to `credential`, as a device binds its leaf credential.
pub(crate) fn identity(provider: &Provider, credential: &[u8]) -> Identity {
    let key = Identity::generate_signature_key(provider).unwrap();
    Identity::bind(provider, credential, key).unwrap()
}

/// A KeyPackage of `identity`'s whose leaf lives `seconds` more.
pub(crate) fn short_lived_key_package(provider: &Provider, identity: &Identity, seconds: u64) -> KeyPackage {
    identity.key_package_living(provider, Lifetime::new(seconds)).unwrap()
}

impl Group {
    /// A message taken as the client takes it: a commit applied as it comes.
    pub(crate) fn receive(&mut self, provider: &Provider, msg_bytes: &[u8]) -> Result<ProcessedMessage, MlsError> {
        let mut processed = self.process_message(provider, IncomingMessage::parse(msg_bytes)?)?;
        if processed.kind() == ProcessedKind::Commit {
            self.apply_commit(provider, &mut processed)?;
        }
        Ok(processed)
    }
}

pub(crate) fn welcome_of(bytes: &[u8]) -> IncomingWelcome {
    IncomingWelcome::parse(bytes).unwrap()
}

pub(crate) fn group_info_of(bytes: &[u8]) -> IncomingGroupInfo {
    IncomingGroupInfo::parse(bytes).unwrap()
}

pub(crate) fn message_of(bytes: &[u8]) -> IncomingMessage {
    IncomingMessage::parse(bytes).unwrap()
}

pub(crate) fn tree_of(bytes: &[u8]) -> RatchetTree {
    RatchetTree::parse(bytes).unwrap()
}

pub(crate) fn make_alice_and_bob() -> (Provider, Identity, Provider, Identity) {
    let alice_p = Provider::new();
    let alice = identity(&alice_p, b"alice@idp.alice.com");
    let bob_p = Provider::new();
    let bob = identity(&bob_p, b"bob@idp.bob.com");
    (alice_p, alice, bob_p, bob)
}

/// Alice and Bob, Bob joined from Alice's Welcome.
pub(crate) fn alice_with_bob(group_id: &[u8]) -> (Provider, Group, Provider, Group) {
    let (alice_p, alice, bob_p, bob) = make_alice_and_bob();
    let mut alice_group = Group::create_new(&alice_p, &alice, group_id).unwrap();
    let add = alice_group
        .add_member(&alice_p, &bob.key_package(&bob_p).unwrap())
        .unwrap();
    alice_group.merge_pending_commit(&alice_p).unwrap();
    let bob_group = Group::join(&bob_p, welcome_of(&add.welcome), None).unwrap();
    (alice_p, alice_group, bob_p, bob_group)
}

/// Bob's proposal of a new credential for his leaf, as a member's client could send it.
pub(crate) fn bobs_update_proposal(bob_p: &Provider, bob_group: &mut Group) -> Vec<u8> {
    let bob_signer = bob_group.signer(bob_p).unwrap();
    let parameters = LeafNodeParameters::builder()
        .with_credential_with_key(CredentialWithKey {
            credential: BasicCredential::new(b"bob, proposed".to_vec()).into(),
            signature_key: bob_signer.public().into(),
        })
        .build();
    let (proposal, _) = bob_group
        .mls_group
        .propose_self_update(&bob_p.0, &bob_signer, parameters)
        .unwrap();
    serialize_message(&proposal).unwrap()
}

/// Mallory, in no group, asking to be added to `group`.
pub(crate) fn join_proposal(group: &Group, credential: &[u8]) -> Vec<u8> {
    let provider = Provider::new();
    let mallory = identity(&provider, credential);
    let proposal = JoinProposal::new::<<OpenMlsRustCrypto as OpenMlsProvider>::StorageProvider>(
        mallory.key_package(&provider).unwrap().0,
        group.mls_group.group_id().clone(),
        group.mls_group.epoch(),
        &mallory.signer(&provider).unwrap(),
    )
    .unwrap();
    serialize_message(&proposal).unwrap()
}
