//! HPKE as the web client calls it: `openmls_core::hpke`'s, its key pairs and seals with getters.

use openmls_core::hpke;
use wasm_bindgen::prelude::*;

use crate::js;

#[wasm_bindgen]
pub struct HpkeKeyPair(hpke::HpkeKeyPair);

#[wasm_bindgen]
impl HpkeKeyPair {
    #[wasm_bindgen(getter)]
    pub fn public_key(&self) -> Vec<u8> {
        self.0.public_key.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn private_key(&self) -> Vec<u8> {
        self.0.private_key.to_vec()
    }
}

#[wasm_bindgen]
pub struct HpkeSealed(hpke::HpkeSealed);

#[wasm_bindgen]
impl HpkeSealed {
    #[wasm_bindgen(getter)]
    pub fn enc(&self) -> Vec<u8> {
        self.0.enc.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ciphertext(&self) -> Vec<u8> {
        self.0.ciphertext.clone()
    }
}

#[wasm_bindgen]
pub fn hpke_generate_key_pair() -> Result<HpkeKeyPair, JsError> {
    hpke::generate().map(HpkeKeyPair).map_err(js)
}

#[wasm_bindgen]
pub fn hpke_derive_key_pair(ikm: &[u8]) -> Result<HpkeKeyPair, JsError> {
    hpke::derive(ikm).map(HpkeKeyPair).map_err(js)
}

#[wasm_bindgen]
pub fn hpke_seal(public_key: &[u8], info: &[u8], aad: &[u8], plaintext: &[u8]) -> Result<HpkeSealed, JsError> {
    hpke::seal(public_key, info, aad, plaintext)
        .map(HpkeSealed)
        .map_err(js)
}

#[wasm_bindgen]
pub fn hpke_open(
    private_key: &[u8],
    enc: &[u8],
    ciphertext: &[u8],
    info: &[u8],
    aad: &[u8],
) -> Result<Vec<u8>, JsError> {
    hpke::open(private_key, enc, ciphertext, info, aad).map_err(js)
}
