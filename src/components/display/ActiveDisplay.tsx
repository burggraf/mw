interface DisplayContent {
  type: 'lyrics' | 'media' | 'blank';
  title?: string;
  lines?: string[];
  mediaUrl?: string;
}

interface ActiveDisplayProps {
  content: DisplayContent;
}

export function ActiveDisplay({ content }: ActiveDisplayProps) {
  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center p-16">
      {content.type === 'blank' && (
        <div className="text-center">
          <p className="text-4xl text-muted-foreground">Blank</p>
        </div>
      )}

      {content.type === 'lyrics' && (
        <div className="text-center max-w-5xl">
          {content.title && (
            <h2 className="text-3xl font-bold mb-8 text-muted-foreground">
              {content.title}
            </h2>
          )}
          <div className="space-y-4">
            {content.lines?.map((line, i) => (
              <p key={i} className="text-5xl font-semibold">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {content.type === 'media' && content.mediaUrl && (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={content.mediaUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-sm text-muted-foreground">
          Press MENU or BACK for options
        </p>
      </div>
    </div>
  );
}
