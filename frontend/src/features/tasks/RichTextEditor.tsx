import { DragEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Attachment } from "./api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  format: string;
  source: string;
  onChange: (format: "markdown", source: string, plain: string) => void;
  attachments?: Attachment[];
  attachmentURLs?: Record<string, string>;
  onFiles?: (files: File[]) => Promise<Attachment[]>;
  onOpenAttachment?: (id: string) => void;
};
export function RichTextEditor({
  source,
  onChange,
  attachments = [],
  attachmentURLs = {},
  onFiles,
  onOpenAttachment,
}: Props) {
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const set = (value: string) =>
    onChange("markdown", value, value.replace(/[#_*`>\[\]()!-]/g, " "));
  const insert = (text: string) => {
    const input = ref.current;
    if (!input) {
      set(source + text);
      return;
    }
    const start = input.selectionStart;
    set(source.slice(0, start) + text + source.slice(input.selectionEnd));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    });
  };
  const upload = async (files: File[]) => {
    if (!onFiles || !files.length) return;
    const items = await onFiles(files);
    insert(
      items
        .map((item) =>
          item.mimeType.startsWith("image/")
            ? `\n![${item.originalName}](attachment://${item.id})\n`
            : `\n[${item.originalName}](attachment://${item.id})\n`,
        )
        .join(""),
    );
  };
  return (
    <div className="overflow-hidden rounded-md bg-muted/25">
      <div className="flex h-8 items-center gap-1 border-b px-1">
        <Button
          type="button"
          size="xs"
          variant={!preview ? "secondary" : "ghost"}
          onClick={() => setPreview(false)}
        >
          编辑
        </Button>
        <Button
          type="button"
          size="xs"
          variant={preview ? "secondary" : "ghost"}
          onClick={() => setPreview(true)}
        >
          预览
        </Button>
        <span className="ml-auto text-[10px] text-muted-foreground">
          Markdown
        </span>
      </div>
      {preview ? (
        <div className="prose prose-sm dark:prose-invert min-h-28 max-w-none p-3 text-[13px]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img: ({ src, alt }) => {
                const id = src?.replace("attachment://", "") ?? "";
                return (
                  <img
                    src={attachmentURLs[id]}
                    alt={alt ?? ""}
                    className="max-h-64 cursor-zoom-in rounded"
                    onClick={() => onOpenAttachment?.(id)}
                  />
                );
              },
              a: ({ href, children }) =>
                href?.startsWith("attachment://") ? (
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => onOpenAttachment?.(href.slice(13))}
                  >
                    {children}
                  </button>
                ) : (
                  <a href={href}>{children}</a>
                ),
            }}
          >
            {source}
          </ReactMarkdown>
        </div>
      ) : (
        <Textarea
          ref={ref}
          value={source}
          rows={8}
          onChange={(e) => set(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e: DragEvent<HTMLTextAreaElement>) => {
            e.preventDefault();
            void upload(Array.from(e.dataTransfer.files));
          }}
          placeholder="使用 Markdown 记录描述；拖入图片或文件会自动上传并插入引用。"
          className="min-h-32 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      )}
      <div className="flex flex-wrap gap-1 border-t p-1">
        {attachments.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="xs"
            variant="ghost"
            onClick={() =>
              insert(
                item.mimeType.startsWith("image/")
                  ? `![${item.originalName}](attachment://${item.id})`
                  : `[${item.originalName}](attachment://${item.id})`,
              )
            }
          >
            引用 {item.originalName}
          </Button>
        ))}
      </div>
    </div>
  );
}
