//! What the test modules share.

use openmls::key_packages::Lifetime;

use crate::{Identity, KeyPackage, Provider};

/// A fresh signature key bound to `credential`, as a device binds its leaf credential.
pub(crate) fn identity(provider: &Provider, credential: &[u8]) -> Identity {
    let key = Identity::generate_signature_key(provider).unwrap();
    Identity::bind(provider, credential, key).unwrap()
}

/// A KeyPackage of `identity`'s whose leaf lives `seconds` more.
pub(crate) fn short_lived_key_package(provider: &Provider, identity: &Identity, seconds: u64) -> KeyPackage {
    identity.key_package_living(provider, Lifetime::new(seconds)).unwrap()
}
