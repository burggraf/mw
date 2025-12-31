//! Linux EDID extraction from /sys/class/drm
//!
//! TODO: Implement Linux EDID extraction
//! The approach:
//! 1. Enumerate /sys/class/drm/card*/*/edid files
//! 2. Read EDID binary data from each file
//! 3. Parse EDID bytes

use super::{parse_edid, DisplayFingerprint};
use std::fs;
use std::path::Path;

/// Get EDID fingerprints for all connected displays on Linux
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    let mut results = Vec::new();
    let drm_path = Path::new("/sys/class/drm");

    if !drm_path.exists() {
        tracing::warn!("DRM path not found: /sys/class/drm");
        return results;
    }

    // Enumerate card* directories
    if let Ok(entries) = fs::read_dir(drm_path) {
        let mut index = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().unwrap_or_default().to_string_lossy();

            // Look for card0-*, card1-* etc. (connected outputs)
            if name.starts_with("card") && name.contains('-') {
                let edid_path = path.join("edid");
                if edid_path.exists() {
                    match fs::read(&edid_path) {
                        Ok(edid_bytes) => {
                            if !edid_bytes.is_empty() {
                                if let Some(fingerprint) = parse_edid(&edid_bytes) {
                                    tracing::info!(
                                        "Display {} ({}): {} {} (S/N: {})",
                                        index,
                                        name,
                                        fingerprint.manufacturer_id,
                                        fingerprint.model_name,
                                        fingerprint.serial_number
                                    );
                                    results.push((index, fingerprint));
                                    index += 1;
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to read EDID from {}: {}", edid_path.display(), e);
                        }
                    }
                }
            }
        }
    }

    tracing::info!("Found {} displays with EDID data on Linux", results.len());
    results
}
