use serde::{Deserialize, Serialize};

/// WebSocket message types with tag-based deserialization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    #[serde(rename = "lyrics")]
    Lyrics(LyricsData),

    #[serde(rename = "slide")]
    Slide(SlideData),

    #[serde(rename = "ping")]
    Ping,
}

/// Data for lyrics display updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsData {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub title: String,
    pub lyrics: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_url: Option<String>,
    pub timestamp: i64,
}

/// Data for slide navigation updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlideData {
    pub church_id: String,
    pub event_id: String,
    pub song_id: String,
    pub slide_index: usize,
    pub timestamp: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_lyrics_message() {
        let msg = WsMessage::Lyrics(LyricsData {
            church_id: "church-123".to_string(),
            event_id: "event-456".to_string(),
            song_id: "song-789".to_string(),
            title: "Amazing Grace".to_string(),
            lyrics: "# Verse 1\nAmazing grace...".to_string(),
            background_url: Some("https://example.com/bg.jpg".to_string()),
            timestamp: 1234567890,
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"lyrics""#));
        assert!(json.contains(r#""church_id":"church-123""#));
        assert!(json.contains("Amazing Grace"));
    }

    #[test]
    fn test_deserialize_lyrics_message() {
        let json = r#"{"type":"lyrics","data":{"church_id":"church-123","event_id":"event-456","song_id":"song-789","title":"Amazing Grace","lyrics":"Verse 1","background_url":null,"timestamp":1234567890}}"#;

        let msg: WsMessage = serde_json::from_str(json).unwrap();

        match msg {
            WsMessage::Lyrics(data) => {
                assert_eq!(data.church_id, "church-123");
                assert_eq!(data.title, "Amazing Grace");
            }
            _ => panic!("Expected Lyrics message"),
        }
    }

    #[test]
    fn test_serialize_slide_message() {
        let msg = WsMessage::Slide(SlideData {
            church_id: "church-123".to_string(),
            event_id: "event-456".to_string(),
            song_id: "song-789".to_string(),
            slide_index: 3,
            timestamp: 1234567890,
        });

        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"slide""#));
        assert!(json.contains(r#""slide_index":3"#));
    }

    #[test]
    fn test_lyrics_data_without_background() {
        let data = LyricsData {
            church_id: "church-123".to_string(),
            event_id: "event-456".to_string(),
            song_id: "song-789".to_string(),
            title: "Test Song".to_string(),
            lyrics: "Test lyrics".to_string(),
            background_url: None,
            timestamp: 1234567890,
        };

        let json = serde_json::to_string(&data).unwrap();
        // When background_url is None, it should be omitted from serialization
        assert!(!json.contains("background_url"));
    }
}
