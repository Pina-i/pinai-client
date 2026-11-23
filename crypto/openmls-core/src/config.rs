use openmls::group::MlsGroupJoinConfig;
use openmls_traits::types::Ciphersuite;

/// Single ciphersuite — pinned to keep the WASM bundle small and to
/// avoid a runtime negotiation step. X25519 + ChaCha20Poly1305 + SHA256
/// + Ed25519 is RFC 9420's mandatory-to-implement suite and the same one
/// the openmls reference WASM example pins.
pub(crate) const CIPHERSUITE: Ciphersuite =
    Ciphersuite::MLS_128_DHKEMX25519_CHACHA20POLY1305_SHA256_Ed25519;

/// A year: a member applies an add only within the added KeyPackage's lifetime, and openmls's
/// 12 weeks would leave one away a few weeks unable to read on (`crypto/README.md`).
pub(crate) const KEY_PACKAGE_LIFETIME_SECONDS: u64 = 365 * 24 * 60 * 60;

/// How many past epochs' keys a device keeps for the messages it hasn't read: a message and a
/// commit travel separately, and one sent just before a commit can arrive after it. openmls still
/// deletes each key once used.
pub(crate) const MAX_PAST_EPOCHS: usize = 5;

/// How a device runs a group it joined. Its Welcomes carry the ratchet tree, as a founder's do: a
/// user's other devices and later members are added by whoever is at hand, not only the founder.
/// It keeps the last `MAX_PAST_EPOCHS` epochs' keys for messages it hasn't read.
pub(crate) fn join_config() -> MlsGroupJoinConfig {
    MlsGroupJoinConfig::builder()
        .use_ratchet_tree_extension(true)
        .max_past_epochs(MAX_PAST_EPOCHS)
        .build()
}
