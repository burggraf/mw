//! EDID (Extended Display Identification Data) extraction module
//!
//! This module provides platform-specific EDID extraction to fingerprint physical monitors.
//! Each monitor has a unique fingerprint based on manufacturer ID + serial number from EDID.
//!
//! Supported platforms:
//! - macOS: Uses IOKit to read EDID from IODisplayConnect services
//! - Windows: Uses SetupAPI/Registry to read EDID (TODO)
//! - Linux: Reads from /sys/class/drm/*/edid (TODO)

use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
mod linux;

/// Fingerprint data extracted from EDID
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayFingerprint {
    /// 3-character manufacturer ID (e.g., "DEL" for Dell, "SAM" for Samsung)
    pub manufacturer_id: String,
    /// Product code from EDID
    pub product_code: u16,
    /// Serial number from EDID (may be 0 if not set)
    pub serial_number: u32,
    /// Model name from descriptor strings (e.g., "DELL U2723QE")
    pub model_name: String,
    /// Physical width in centimeters
    pub width_cm: u32,
    /// Physical height in centimeters
    pub height_cm: u32,
    /// Week of manufacture (1-53)
    pub manufacture_week: u8,
    /// Year of manufacture
    pub manufacture_year: u16,
}

impl DisplayFingerprint {
    /// Generate a deterministic UUID from the fingerprint
    /// This ensures the same physical monitor always gets the same UUID
    pub fn to_uuid(&self) -> Uuid {
        // Create a unique string from the fingerprint components
        let fingerprint_str = format!(
            "{}:{}:{}:{}",
            self.manufacturer_id,
            self.product_code,
            self.serial_number,
            self.model_name
        );

        // Use UUID v5 (SHA-1 based) with a namespace for deterministic generation
        // Using the DNS namespace as a base
        Uuid::new_v5(&Uuid::NAMESPACE_DNS, fingerprint_str.as_bytes())
    }

    /// Get a human-readable display name
    pub fn display_name(&self) -> String {
        if !self.model_name.is_empty() {
            self.model_name.clone()
        } else {
            format!("{} Display", self.manufacturer_id)
        }
    }
}

/// Display info combining OS data with EDID fingerprint
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    /// OS-assigned monitor index (volatile, may change)
    pub os_index: i32,
    /// OS-provided name
    pub os_name: String,
    /// Screen position X
    pub position_x: i32,
    /// Screen position Y
    pub position_y: i32,
    /// Pixel width
    pub width: u32,
    /// Pixel height
    pub height: u32,
    /// Scale factor
    pub scale_factor: f64,
    /// Is primary display
    pub is_primary: bool,
    /// EDID fingerprint (if available)
    pub fingerprint: Option<DisplayFingerprint>,
    /// Generated display UUID (from fingerprint or fallback)
    pub display_id: String,
}

impl DisplayInfo {
    /// Create a fallback fingerprint when EDID is not available
    /// Uses OS info to create a less reliable but still useful ID
    pub fn create_fallback_id(os_index: i32, os_name: &str, width: u32, height: u32) -> String {
        let fallback_str = format!(
            "fallback:{}:{}:{}x{}",
            os_index, os_name, width, height
        );
        Uuid::new_v5(&Uuid::NAMESPACE_DNS, fallback_str.as_bytes()).to_string()
    }
}

/// Get EDID fingerprints for all connected displays
/// Returns a vector of (os_index, DisplayFingerprint) pairs
#[cfg(target_os = "macos")]
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    macos::get_display_fingerprints()
}

#[cfg(target_os = "windows")]
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    windows::get_display_fingerprints()
}

#[cfg(target_os = "linux")]
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    linux::get_display_fingerprints()
}

/// Fallback for unsupported platforms (Android, iOS)
/// These typically have a single display, so we return empty
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    Vec::new()
}

/// Parse EDID bytes into a DisplayFingerprint
/// EDID structure: https://en.wikipedia.org/wiki/Extended_Display_Identification_Data
pub fn parse_edid(edid_bytes: &[u8]) -> Option<DisplayFingerprint> {
    // EDID must be at least 128 bytes
    if edid_bytes.len() < 128 {
        tracing::warn!("EDID data too short: {} bytes", edid_bytes.len());
        return None;
    }

    // Verify EDID header (bytes 0-7 should be 00 FF FF FF FF FF FF 00)
    let header = &edid_bytes[0..8];
    let expected_header = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];
    if header != expected_header {
        tracing::warn!("Invalid EDID header: {:02X?}", header);
        return None;
    }

    // Manufacturer ID (bytes 8-9): 3 letters encoded in 2 bytes
    let mfg_bytes = ((edid_bytes[8] as u16) << 8) | (edid_bytes[9] as u16);
    let manufacturer_id = decode_manufacturer_id(mfg_bytes);

    // Product code (bytes 10-11): little-endian
    let product_code = (edid_bytes[11] as u16) << 8 | (edid_bytes[10] as u16);

    // Serial number (bytes 12-15): little-endian 32-bit
    let serial_number = (edid_bytes[15] as u32) << 24
        | (edid_bytes[14] as u32) << 16
        | (edid_bytes[13] as u32) << 8
        | (edid_bytes[12] as u32);

    // Manufacture week (byte 16) and year (byte 17, add 1990)
    let manufacture_week = edid_bytes[16];
    let manufacture_year = (edid_bytes[17] as u16) + 1990;

    // Physical size in cm (bytes 21-22)
    let width_cm = edid_bytes[21] as u32;
    let height_cm = edid_bytes[22] as u32;

    // Model name from descriptor blocks (bytes 54-125)
    let model_name = extract_model_name(edid_bytes);

    Some(DisplayFingerprint {
        manufacturer_id,
        product_code,
        serial_number,
        model_name,
        width_cm,
        height_cm,
        manufacture_week,
        manufacture_year,
    })
}

/// Decode 3-character manufacturer ID from 2-byte encoded value
fn decode_manufacturer_id(encoded: u16) -> String {
    let c1 = ((encoded >> 10) & 0x1F) as u8 + b'A' - 1;
    let c2 = ((encoded >> 5) & 0x1F) as u8 + b'A' - 1;
    let c3 = (encoded & 0x1F) as u8 + b'A' - 1;

    format!("{}{}{}", c1 as char, c2 as char, c3 as char)
}

/// Extract model name from EDID descriptor blocks
fn extract_model_name(edid_bytes: &[u8]) -> String {
    // Descriptor blocks are at bytes 54-71, 72-89, 90-107, 108-125
    let descriptor_offsets = [54, 72, 90, 108];

    for offset in descriptor_offsets {
        // Check if this is a monitor name descriptor (tag 0xFC)
        if edid_bytes[offset] == 0x00
            && edid_bytes[offset + 1] == 0x00
            && edid_bytes[offset + 2] == 0x00
            && edid_bytes[offset + 3] == 0xFC
        {
            // Name is at bytes 5-17 of the descriptor, terminated by 0x0A
            let name_bytes = &edid_bytes[offset + 5..offset + 18];
            let name: String = name_bytes
                .iter()
                .take_while(|&&b| b != 0x0A && b != 0x00)
                .map(|&b| b as char)
                .collect();
            return name.trim().to_string();
        }
    }

    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_manufacturer_id() {
        // Dell = "DEL" = 0x10 0x05 0x0C = 0b00100 00101 01100 = 0x10AC
        assert_eq!(decode_manufacturer_id(0x10AC), "DEL");

        // Samsung = "SAM" = 0x13 0x01 0x0D = 0b10011 00001 01101 = 0x4C2D
        assert_eq!(decode_manufacturer_id(0x4C2D), "SAM");
    }

    #[test]
    fn test_fingerprint_to_uuid() {
        let fp = DisplayFingerprint {
            manufacturer_id: "DEL".to_string(),
            product_code: 12345,
            serial_number: 67890,
            model_name: "DELL U2723QE".to_string(),
            width_cm: 60,
            height_cm: 34,
            manufacture_week: 42,
            manufacture_year: 2023,
        };

        let uuid = fp.to_uuid();
        // Same fingerprint should always produce same UUID
        assert_eq!(uuid, fp.to_uuid());

        // Different fingerprint should produce different UUID
        let fp2 = DisplayFingerprint {
            serial_number: 11111,
            ..fp.clone()
        };
        assert_ne!(uuid, fp2.to_uuid());
    }
}
