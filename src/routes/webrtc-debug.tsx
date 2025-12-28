import { WebRTCDebugPanel } from '@/components/webrtc';

export default function WebRTCDebugPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">WebRTC Debug</h1>
      <WebRTCDebugPanel />
    </div>
  );
}
