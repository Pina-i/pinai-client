use openmls::key_packages::{errors::KeyPackageVerifyError, KeyPackageIn};
use openmls::prelude::ProtocolVersion;
use tls_codec::Deserialize;

use super::*;
use crate::config::KEY_PACKAGE_LIFETIME_SECONDS;
use crate::testing::*;
use crate::{Identity, Provider};

/// A claimed KeyPackage shows what the device checks before adding it.
#[test]
fn a_key_package_shows_its_leafs_credential_and_signature_key() {
    let provider = Provider::new();
    let key = Identity::generate_signature_key(&provider).unwrap();
    let bound = Identity::bind(&provider, b"{\"v\":2}", key.clone()).unwrap();

    let parsed = KeyPackage::parse(&bound.key_package(&provider).unwrap().to_bytes().unwrap()).unwrap();

    assert_eq!(parsed.credential_bytes(), b"{\"v\":2}");
    assert_eq!(parsed.signature_public_key(), key);
    assert_eq!(key.len(), 32);
}

/// The lifetime still counts when a KeyPackage is added: `KeyPackage::parse` validates it so.
#[test]
fn a_key_package_past_its_lifetime_is_still_refused() {
    let provider = Provider::new();
    let bob = identity(&provider, b"bob");
    let bytes = short_lived_key_package(&provider, &bob, 1).to_bytes().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(2_100));

    let validated = KeyPackageIn::tls_deserialize(&mut bytes.as_slice())
        .unwrap()
        .validate(&openmls_rust_crypto::RustCrypto::default(), ProtocolVersion::Mls10);

    assert!(matches!(validated, Err(KeyPackageVerifyError::InvalidLifetime)));
    assert!(matches!(KeyPackage::parse(&bytes), Err(MlsError::Malformed { .. })));
}

/// What every KeyPackage carries: a year, from an hour back for clocks running late.
#[test]
fn a_key_package_lives_a_year() {
    let provider = Provider::new();
    let bob = identity(&provider, b"bob");

    let lifetime = *bob.key_package(&provider).unwrap().0.life_time();

    assert_eq!(lifetime.not_after() - lifetime.not_before(), KEY_PACKAGE_LIFETIME_SECONDS + 60 * 60);
}

#[test]
fn bytes_that_are_no_key_package_are_malformed() {
    assert!(matches!(KeyPackage::parse(&[1, 2, 3]), Err(MlsError::Malformed { .. })));
}

#[test]
fn a_key_needs_its_keypair_in_the_providers_storage_to_be_bound() {
    let elsewhere = Provider::new();
    let key = Identity::generate_signature_key(&elsewhere).unwrap();

    assert!(matches!(Identity::bind(&Provider::new(), b"bob", key), Err(MlsError::State(_))));
}
