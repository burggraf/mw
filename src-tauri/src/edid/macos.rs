//! macOS EDID extraction using IOKit
//!
//! This module uses IOKit to enumerate display services and extract EDID data.
//! The approach:
//! 1. Get matching services for IODisplayConnect
//! 2. For each display, read the IODisplayEDID property
//! 3. Parse the EDID bytes to extract fingerprint data

use super::{parse_edid, DisplayFingerprint};
use std::process::Command;

/// Get EDID fingerprints for all connected displays on macOS
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    let mut results = Vec::new();

    // Use ioreg command to get EDID data
    // This is more reliable than direct IOKit bindings and works without unsafe code
    match get_edid_via_ioreg() {
        Ok(edids) => {
            for (index, edid_bytes) in edids.into_iter().enumerate() {
                if let Some(fingerprint) = parse_edid(&edid_bytes) {
                    tracing::info!(
                        "Display {}: {} {} (S/N: {})",
                        index,
                        fingerprint.manufacturer_id,
                        fingerprint.model_name,
                        fingerprint.serial_number
                    );
                    results.push((index as i32, fingerprint));
                }
            }
        }
        Err(e) => {
            tracing::warn!("Failed to get EDID via ioreg: {}", e);
        }
    }

    results
}

/// Get EDID data using the ioreg command
/// Returns a vector of EDID byte arrays (one per display)
fn get_edid_via_ioreg() -> Result<Vec<Vec<u8>>, String> {
    // Run ioreg to get display EDID data
    // -l: long output (includes all properties)
    // -w0: no line wrapping
    // -r: recursively search
    // -c: filter by class name
    let output = Command::new("ioreg")
        .args(["-l", "-w0", "-r", "-c", "IODisplayConnect"])
        .output()
        .map_err(|e| format!("Failed to run ioreg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ioreg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut edids = Vec::new();

    // Parse the ioreg output to find IODisplayEDID entries
    // Format: "IODisplayEDID" = <hex bytes>
    for line in stdout.lines() {
        if let Some(edid_start) = line.find("\"IODisplayEDID\" = <") {
            let start = edid_start + "\"IODisplayEDID\" = <".len();
            if let Some(end) = line[start..].find('>') {
                let hex_str = &line[start..start + end];
                if let Ok(bytes) = hex_to_bytes(hex_str) {
                    edids.push(bytes);
                }
            }
        }
    }

    tracing::info!("Found {} displays with EDID data via ioreg", edids.len());
    Ok(edids)
}

/// Convert hex string to bytes
fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.replace(' ', "");
    if hex.len() % 2 != 0 {
        return Err("Hex string has odd length".to_string());
    }

    (0..hex.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&hex[i..i + 2], 16)
                .map_err(|e| format!("Invalid hex at position {}: {}", i, e))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_to_bytes() {
        assert_eq!(hex_to_bytes("00FF").unwrap(), vec![0x00, 0xFF]);
        assert_eq!(hex_to_bytes("DEADBEEF").unwrap(), vec![0xDE, 0xAD, 0xBE, 0xEF]);
        assert!(hex_to_bytes("0").is_err()); // Odd length
        assert!(hex_to_bytes("GG").is_err()); // Invalid hex
    }

    #[test]
    #[ignore] // This test requires a real display
    fn test_get_display_fingerprints() {
        let fingerprints = get_display_fingerprints();
        println!("Found {} display fingerprints:", fingerprints.len());
        for (index, fp) in fingerprints {
            println!(
                "  Display {}: {} {} ({}x{} cm, S/N: {}, UUID: {})",
                index,
                fp.manufacturer_id,
                fp.model_name,
                fp.width_cm,
                fp.height_cm,
                fp.serial_number,
                fp.to_uuid()
            );
        }
    }
}
