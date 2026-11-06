//! HPKE (RFC 9180) in base mode, with the one suite the account's devices seal key shares with:
//! DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM — identity-provider/specs/e2ee.md § 3.11.
//! openmls_rust_crypto's own implementation, the one MLS uses, so the bundle carries no second.

use openmls_rust_crypto::RustCrypto;
use openmls_traits::{
    crypto::OpenMlsCrypto,
    random::OpenMlsRand,
    types::{CryptoError, HpkeAeadType, HpkeCiphertext, HpkeConfig, HpkeKdfType, HpkeKemType},
};
use wasm_bindgen::prelude::*;
use zeroize::Zeroizing;

fn config() -> HpkeConfig {
    HpkeConfig(
        HpkeKemType::DhKem25519,
        HpkeKdfType::HkdfSha256,
        HpkeAeadType::AesGcm128,
    )
}

/// An X25519 key pair: the raw 32-byte public key, and the private key.
#[wasm_bindgen]
pub struct HpkeKeyPair {
    public_key: Vec<u8>,
    private_key: Zeroizing<Vec<u8>>,
}

#[wasm_bindgen]
impl HpkeKeyPair {
    #[wasm_bindgen(getter)]
    pub fn public_key(&self) -> Vec<u8> {
        self.public_key.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn private_key(&self) -> Vec<u8> {
        self.private_key.to_vec()
    }
}

/// A single-shot seal: `enc`, the 32-byte encapsulated key, and the ciphertext.
#[wasm_bindgen]
pub struct HpkeSealed {
    enc: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[wasm_bindgen]
impl HpkeSealed {
    #[wasm_bindgen(getter)]
    pub fn enc(&self) -> Vec<u8> {
        self.enc.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ciphertext(&self) -> Vec<u8> {
        self.ciphertext.clone()
    }
}

pub(crate) fn derive(ikm: &[u8]) -> Result<HpkeKeyPair, CryptoError> {
    let pair = RustCrypto::default().derive_hpke_keypair(config(), ikm)?;
    Ok(HpkeKeyPair {
        public_key: pair.public,
        private_key: Zeroizing::new(pair.private.to_vec()),
    })
}

pub(crate) fn generate() -> Result<HpkeKeyPair, CryptoError> {
    let crypto = RustCrypto::default();
    let ikm = Zeroizing::new(
        crypto
            .random_vec(32)
            .map_err(|_| CryptoError::InsufficientRandomness)?,
    );
    derive(&ikm)
}

pub(crate) fn seal(
    public_key: &[u8],
    info: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<HpkeSealed, CryptoError> {
    let sealed = RustCrypto::default().hpke_seal(config(), public_key, info, aad, plaintext)?;
    Ok(HpkeSealed {
        enc: sealed.kem_output.as_slice().to_vec(),
        ciphertext: sealed.ciphertext.as_slice().to_vec(),
    })
}

pub(crate) fn open(
    private_key: &[u8],
    enc: &[u8],
    ciphertext: &[u8],
    info: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    let input = HpkeCiphertext {
        kem_output: enc.to_vec().into(),
        ciphertext: ciphertext.to_vec().into(),
    };
    RustCrypto::default().hpke_open(config(), &input, private_key, info, aad)
}

/// A fresh key pair, from 32 random bytes as openmls makes its own.
#[wasm_bindgen]
pub fn hpke_generate_key_pair() -> Result<HpkeKeyPair, JsError> {
    generate().map_err(|e| JsError::new(&format!("HPKE key generation failed: {e:?}")))
}

/// RFC 9180 `DeriveKeyPair(ikm)`.
#[wasm_bindgen]
pub fn hpke_derive_key_pair(ikm: &[u8]) -> Result<HpkeKeyPair, JsError> {
    derive(ikm).map_err(|e| JsError::new(&format!("HPKE key derivation failed: {e:?}")))
}

/// Seals to `public_key`. A low-order key, whose shared secret is all zeros, is refused
/// (RFC 9180 § 7.1.4).
#[wasm_bindgen]
pub fn hpke_seal(
    public_key: &[u8],
    info: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<HpkeSealed, JsError> {
    seal(public_key, info, aad, plaintext)
        .map_err(|e| JsError::new(&format!("HPKE seal failed: {e:?}")))
}

#[wasm_bindgen]
pub fn hpke_open(
    private_key: &[u8],
    enc: &[u8],
    ciphertext: &[u8],
    info: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, JsError> {
    open(private_key, enc, ciphertext, info, aad)
        .map_err(|e| JsError::new(&format!("HPKE open failed: {e:?}")))
}

#[cfg(test)]
mod tests;
