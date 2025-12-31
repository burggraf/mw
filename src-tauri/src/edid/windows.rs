//! Windows EDID extraction using SetupAPI/Registry
//!
//! TODO: Implement Windows EDID extraction
//! The approach:
//! 1. Use SetupAPI to enumerate DISPLAY devices
//! 2. Read EDID from registry: SYSTEM\CurrentControlSet\Enum\DISPLAY\{device}\Device Parameters\EDID
//! 3. Parse EDID bytes

use super::{parse_edid, DisplayFingerprint};

/// Get EDID fingerprints for all connected displays on Windows
pub fn get_display_fingerprints() -> Vec<(i32, DisplayFingerprint)> {
    // TODO: Implement Windows EDID extraction
    // For now, return empty - displays will use fallback IDs
    tracing::warn!("Windows EDID extraction not yet implemented");
    Vec::new()
}
