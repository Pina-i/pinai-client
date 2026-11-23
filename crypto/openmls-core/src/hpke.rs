//! HPKE (RFC 9180) in base mode, with the one suite the account's devices seal key shares with:
//! DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM — identity-provider/specs/e2ee.md § 3.11.
//! openmls_rust_crypto's own implementation, the one MLS uses, so the engine carries no second.

use openmls_rust_crypto::RustCrypto;
use openmls_traits::{
    crypto::OpenMlsCrypto,
    random::OpenMlsRand,
    types::{HpkeAeadType, HpkeCiphertext, HpkeConfig, HpkeKdfType, HpkeKemType},
};
use zeroize::Zeroizing;

use crate::MlsError;

fn config() -> HpkeConfig {
    HpkeConfig(
        HpkeKemType::DhKem25519,
        HpkeKdfType::HkdfSha256,
        HpkeAeadType::AesGcm128,
    )
}

/// An X25519 key pair: the raw 32-byte public key, and the private key.
pub struct HpkeKeyPair {
    pub public_key: Vec<u8>,
    pub private_key: Zeroizing<Vec<u8>>,
}

/// A single-shot seal: `enc`, the 32-byte encapsulated key, and the ciphertext.
pub struct HpkeSealed {
    pub enc: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

/// RFC 9180 `DeriveKeyPair(ikm)`.
pub fn derive(ikm: &[u8]) -> Result<HpkeKeyPair, MlsError> {
    let pair = RustCrypto::default()
        .derive_hpke_keypair(config(), ikm)
        .map_err(|e| MlsError::refused("HPKE key derivation", format!("{e:?}")))?;
    Ok(HpkeKeyPair {
        public_key: pair.public,
        private_key: Zeroizing::new(pair.private.to_vec()),
    })
}

/// A fresh key pair, from 32 random bytes as openmls makes its own.
pub fn generate() -> Result<HpkeKeyPair, MlsError> {
    let crypto = RustCrypto::default();
    let ikm = Zeroizing::new(
        crypto
            .random_vec(32)
            .map_err(|e| MlsError::refused("HPKE key generation", format!("{e:?}")))?,
    );
    derive(&ikm)
}

/// Seals to `public_key`. A low-order key, whose shared secret is all zeros, is refused
/// (RFC 9180 § 7.1.4).
pub fn seal(
    public_key: &[u8],
    info: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<HpkeSealed, MlsError> {
    let sealed = RustCrypto::default()
        .hpke_seal(config(), public_key, info, aad, plaintext)
        .map_err(|e| MlsError::refused("HPKE seal", format!("{e:?}")))?;
    Ok(HpkeSealed {
        enc: sealed.kem_output.as_slice().to_vec(),
        ciphertext: sealed.ciphertext.as_slice().to_vec(),
    })
}

pub fn open(
    private_key: &[u8],
    enc: &[u8],
    ciphertext: &[u8],
    info: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, MlsError> {
    let input = HpkeCiphertext {
        kem_output: enc.to_vec().into(),
        ciphertext: ciphertext.to_vec().into(),
    };
    RustCrypto::default()
        .hpke_open(config(), &input, private_key, info, aad)
        .map_err(|e| MlsError::refused("HPKE open", format!("{e:?}")))
}

#[cfg(test)]
mod tests;
