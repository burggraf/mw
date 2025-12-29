import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';

interface QRCodeProps {
  /** The data to encode in the QR code */
  value: string;
  /** Size of the QR code in pixels */
  size?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * QR Code component for displaying pairing codes and other data.
 *
 * @example
 * ```tsx
 * <QRCode value="ABC123" size={256} />
 * ```
 */
export function QRCode({ value, size = 256, className }: QRCodeProps) {
  return (
    <div className={cn('bg-white p-4 rounded-lg inline-block', className)}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        includeMargin={false}
      />
    </div>
  );
}
