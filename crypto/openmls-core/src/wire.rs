//! What crosses the wire, read once at the entry: the core's operations take these, never raw
//! bytes. Trailing bytes are tolerated, as they always were.

use openmls::{
    framing::{MlsMessageBodyIn, MlsMessageIn, MlsMessageOut, ProtocolMessage},
    messages::{group_info::VerifiableGroupInfo, Welcome},
    treesync::RatchetTreeIn,
};
use tls_codec::{Deserialize, Serialize};

use crate::MlsError;

/// A Welcome, an `MlsMessage`.
pub struct IncomingWelcome(pub(crate) Welcome);

/// A GroupInfo, an `MlsMessage`, as a commit posts it.
pub struct IncomingGroupInfo(pub(crate) VerifiableGroupInfo);

/// An application message, a proposal or a commit, private or public.
pub struct IncomingMessage(pub(crate) ProtocolMessage);

/// A ratchet tree, sent beside a Welcome.
pub struct RatchetTree(pub(crate) RatchetTreeIn);

fn body(what: &'static str, bytes: &[u8]) -> Result<MlsMessageBodyIn, MlsError> {
    let mut s = bytes;
    let message = MlsMessageIn::tls_deserialize(&mut s).map_err(|e| MlsError::malformed(what, e))?;
    Ok(message.extract())
}

fn kind(body: &MlsMessageBodyIn) -> &'static str {
    match body {
        MlsMessageBodyIn::PublicMessage(_) => "a public message",
        MlsMessageBodyIn::PrivateMessage(_) => "a private message",
        MlsMessageBodyIn::Welcome(_) => "a Welcome",
        MlsMessageBodyIn::GroupInfo(_) => "a GroupInfo",
        MlsMessageBodyIn::KeyPackage(_) => "a KeyPackage",
    }
}

impl IncomingWelcome {
    pub fn parse(bytes: &[u8]) -> Result<Self, MlsError> {
        match body("Welcome", bytes)? {
            MlsMessageBodyIn::Welcome(welcome) => Ok(Self(welcome)),
            other => Err(MlsError::malformed("Welcome", format!("it is {}", kind(&other)))),
        }
    }
}

impl IncomingGroupInfo {
    pub fn parse(bytes: &[u8]) -> Result<Self, MlsError> {
        match body("GroupInfo", bytes)? {
            MlsMessageBodyIn::GroupInfo(group_info) => Ok(Self(group_info)),
            other => Err(MlsError::malformed("GroupInfo", format!("it is {}", kind(&other)))),
        }
    }
}

impl IncomingMessage {
    pub fn parse(bytes: &[u8]) -> Result<Self, MlsError> {
        match body("MLS message", bytes)? {
            MlsMessageBodyIn::PrivateMessage(message) => Ok(Self(message.into())),
            MlsMessageBodyIn::PublicMessage(message) => Ok(Self(message.into())),
            other => Err(MlsError::malformed("MLS message", format!("it is {}", kind(&other)))),
        }
    }
}

impl RatchetTree {
    pub fn parse(bytes: &[u8]) -> Result<Self, MlsError> {
        let mut s = bytes;
        RatchetTreeIn::tls_deserialize(&mut s)
            .map(Self)
            .map_err(|e| MlsError::malformed("Ratchet tree", e))
    }
}

pub(crate) fn serialize_message(message: &MlsMessageOut) -> Result<Vec<u8>, MlsError> {
    let mut out = vec![];
    message
        .tls_serialize(&mut out)
        .map_err(|e| MlsError::refused("MlsMessage serialization", e))?;
    Ok(out)
}

#[cfg(test)]
mod tests;
