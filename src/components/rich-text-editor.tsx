"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
  Unlink,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Rich text for host posts. Writes HTML into a hidden input (`name`) so it
 * submits with a normal server-action form, and fires an input event so
 * `SubmitButton requireChange` notices edits. The server sanitizes it.
 */
export function RichTextEditor({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const hidden = useRef<HTMLInputElement>(null);
  // Controlled: for hidden inputs the browser treats defaultValue as the value,
  // so React would reset it on every re-render.
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, protocols: ["https", "http", "mailto"] },
      }),
    ],
    content: defaultValue,
    editorProps: { attributes: { class: "prose-post min-h-48 px-4 py-3 outline-none", "aria-label": "Post body" } },
    onUpdate: ({ editor }) => setHtml(editor.isEmpty ? "" : editor.getHTML()),
  });

  // Tell the form (SubmitButton requireChange) once the new value is in the DOM.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [html]);

  return (
    <div className="border-2 border-ink bg-[#fbf3e3] focus-within:border-line">
      <input ref={hidden} type="hidden" name={name} value={html} readOnly />
      {editor ? <Toolbar editor={editor} /> : <div className="h-11 border-b-2 border-ink bg-maple-deep/60" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState("");

  function applyLink() {
    const href = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(href) ? href : `https://${href}` }).run();
    setLinking(false);
    setUrl("");
  }

  return (
    <div className="border-b-2 border-ink bg-maple-deep/60">
      <div className="flex flex-wrap items-center gap-0.5 p-1" role="toolbar" aria-label="Formatting">
        <Tool label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold />
        </Tool>
        <Tool label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic />
        </Tool>
        <Divider />
        <Tool
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 />
        </Tool>
        <Tool
          label="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 />
        </Tool>
        <Divider />
        <Tool
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </Tool>
        <Tool
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </Tool>
        <Tool label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote />
        </Tool>
        <Divider />
        <Tool
          label={editor.isActive("link") ? "Edit link" : "Add link"}
          active={editor.isActive("link") || linking}
          onClick={() => {
            setUrl(editor.getAttributes("link").href ?? "");
            setLinking((v) => !v);
          }}
        >
          <LinkIcon />
        </Tool>
        {editor.isActive("link") && (
          <Tool label="Remove link" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
            <Unlink />
          </Tool>
        )}
        <Divider />
        <Tool label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 />
        </Tool>
        <Tool label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 />
        </Tool>
      </div>
      {linking && (
        <div className="flex items-center gap-2 border-t border-ink/20 px-2 py-1.5">
          <input
            type="url"
            value={url}
            autoFocus
            placeholder="https://…"
            aria-label="Link address"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinking(false);
              }
            }}
            className="min-w-0 flex-1 border-0 border-b-2 border-ink bg-transparent px-0 py-1 text-base focus:border-line focus:ring-0 focus:outline-none"
          />
          <button type="button" onClick={applyLink} className="font-display text-sm font-bold tracking-wide text-line uppercase">
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-9 items-center justify-center transition-colors disabled:opacity-30 [&_svg]:size-4.5 ${
        active ? "bg-ink text-maple" : "text-ink hover:bg-ink/10"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-ink/25" />;
}
