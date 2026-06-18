"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Separator,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@payglocal_ui/flux-ui";
import { Icon } from "./icon.js";
import { LoginGate } from "./LoginGate.js";
import { UsageDialog } from "./UsageDialog.js";
import { PublishDialog } from "./PublishDialog.js";
import { SessionsMenu } from "./SessionsMenu.js";
import { useAgentChat, type ChatMessage, type MessageBlock } from "./useAgentChat.js";
import { useDOMPicker } from "./useDOMPicker.js";

export function ChatPanel({
  onClose,
  onDragHandlePointerDown,
  apiBasePath = "/api/lumen",
}: {
  onClose: () => void;
  onDragHandlePointerDown?: (e: React.PointerEvent) => void;
  apiBasePath?: string;
}) {
  const chat = useAgentChat(apiBasePath);
  const picker = useDOMPicker();
  const [input, setInput] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const handleLogout = useCallback(() => {
    setIsLoggedOut(true);
    setShowSessions(false);
    void fetch(`${apiBasePath}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  }, [apiBasePath]);

  useEffect(() => {
    const msgs = chat.messages;
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.role !== "assistant") return;
    const hasTools = last.blocks.some((b) => b.type === "tool");
    const hasText = last.blocks.some((b) => b.type === "text");
    if (hasTools && !hasText) {
      let wasReloaded = false;
      try { wasReloaded = sessionStorage.getItem("lumen:reloadConvoId") === chat.activeId; } catch {}
      if (wasReloaded) void chat.reconnect(chat.activeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — checks for interrupted sessions from page reload.

  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openLightbox = useCallback((url: string) => setLightboxUrl(url), []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    e.target.value = "";
  };

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(null);
    setPreviewUrl(null);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find((item) =>
      item.type.startsWith("image/")
    );
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAttachedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const submit = () => {
    if (!input.trim() && !attachedFile) return;
    void chat.send(input, attachedFile, picker.selected);
    setInput("");
    clearAttachment();
    picker.clear();
  };

  const msgCount = chat.messages.length;
  useEffect(() => {
    if (!showSessions) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [msgCount, showSessions]);

  const activeSession = chat.conversations.find((c) => c.id === chat.activeId);

  const lastMsg = chat.messages[chat.messages.length - 1];
  const isInterrupted =
    !chat.streaming &&
    lastMsg?.role === "assistant" &&
    lastMsg.blocks.some((b) => b.type === "tool") &&
    !lastMsg.blocks.some((b) => b.type === "text");

  return (
    <TooltipProvider delayDuration={400}>
    <div data-lumen-panel className="flex h-[32rem] w-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      {/* Header */}
      <div
        className="flex cursor-grab items-center gap-1.5 border-b border-border px-2 py-2 select-none"
        onPointerDown={onDragHandlePointerDown}
      >
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            title={showSessions ? "Back to chat" : "Sessions"}
            onClick={() => setShowSessions((v) => !v)}
          >
            <Icon name={showSessions ? "x" : "menu"} className="h-4 w-4" />
          </Button>
        </div>

        <Icon name="sparkles" className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate text-sm font-semibold">
          {activeSession?.name ?? "Design Agent"}
        </span>

        <div onPointerDown={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} title="Close">
            <Icon name="x" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <LoginGate
        forceLoggedOut={isLoggedOut}
        onLoginSuccess={() => setIsLoggedOut(false)}
        apiBasePath={apiBasePath}
      >
        {() => (
          <>
            {showSessions ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                <SessionsMenu
                  conversations={chat.conversations}
                  activeId={chat.activeId}
                  onSelect={(id) => {
                    chat.switchConversation(id);
                    setShowSessions(false);
                  }}
                  onCreate={() => {
                    chat.createConversation();
                    setShowSessions(false);
                  }}
                  onRename={chat.renameConversation}
                  onDelete={chat.deleteConversation}
                />
                <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <UsageDialog apiBasePath={apiBasePath} />
                    <PublishDialog apiBasePath={apiBasePath} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={handleLogout}
                    leftIcon={<Icon name="log-out" className="h-3.5 w-3.5" />}
                  >
                    Log out
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-3"
                >
                  {chat.messages.length === 0 && (
                    <p className="px-1 pt-6 text-center text-xs text-muted-foreground">
                      Describe the UI you want to build or change. The agent edits your app and
                      you&apos;ll see it update live.
                    </p>
                  )}
                  {chat.messages.map((m, i) => (
                    <MessageBubble
                      key={i}
                      message={m}
                      isStreaming={chat.streaming && i === chat.messages.length - 1}
                      onImageClick={openLightbox}
                    />
                  ))}

                  {isInterrupted && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300/50 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      <span>Session interrupted — page reloaded mid-task.</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-[11px]"
                        onClick={() =>
                          void chat.send(
                            "Please continue where you left off — the page reloaded and interrupted your previous task."
                          )
                        }
                      >
                        Continue
                      </Button>
                    </div>
                  )}

                  {chat.creditsExhausted && (
                    <div className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                      Your Claude credits are used up for now. Your conversation is saved — just
                      come back and continue when they refill.
                    </div>
                  )}
                  {chat.error && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                      {chat.error}
                    </div>
                  )}
                </div>

                <Separator />

                {(previewUrl || picker.selected) && (
                  <div className="flex flex-wrap items-center gap-2 mx-3 mt-2">
                    {previewUrl && (
                      <div className="relative w-fit">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Attachment"
                          className="h-16 w-16 cursor-zoom-in rounded-md border border-border object-cover"
                          onClick={() => openLightbox(previewUrl)}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute -right-2 -top-2 h-5 w-5 rounded-full p-0"
                          onClick={clearAttachment}
                        >
                          <Icon name="x" className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                    {picker.selected && (
                      <div className="flex items-center gap-1.5 rounded-md border border-blue-300/60 bg-blue-50 dark:bg-blue-950/40 px-2 py-1 text-[11px] text-blue-700 dark:text-blue-300 max-w-full overflow-hidden">
                        <Icon name="crosshair" className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {picker.selected.reactComponentStack[0]
                            ? `<${picker.selected.reactComponentStack[0]}>`
                            : picker.selected.tagName}
                          {picker.selected.classList[0] ? `.${picker.selected.classList[0]}` : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 ml-0.5 text-blue-500 hover:text-blue-700 dark:hover:text-blue-200"
                          onClick={picker.clear}
                        >
                          <Icon name="x" className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col px-2 pb-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="flex items-center justify-end gap-0.5 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={chat.streaming}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="paperclip" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={picker.picking ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={chat.streaming}
                      onClick={() => (picker.picking ? picker.cancel() : picker.start())}
                    >
                      <Icon name="crosshair" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="relative mt-1">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      onPaste={handlePaste}
                      placeholder="Ask the agent to build or change a screen…"
                      rows={2}
                      className="min-h-0 resize-none text-sm pr-10"
                      disabled={chat.streaming}
                    />
                    <div className="absolute bottom-2 right-2">
                      {chat.streaming ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={chat.stop}>
                              <Icon name="square" className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[2147483647]" side="top">
                            Stop generating
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10 disabled:opacity-30"
                              onClick={submit}
                              disabled={!input.trim() && !attachedFile}
                            >
                              <Icon name="send-horizontal" className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="z-[2147483647]" side="top">
                            Send message — Enter
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </LoginGate>

      <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
        <DialogContent
          className="max-w-3xl p-2 z-[2147483647]"
          overlayClassName="z-[2147483646] backdrop-blur-sm"
        >
          <DialogTitle className="sr-only">Image preview</DialogTitle>
          <DialogDescription className="sr-only">Full size image preview</DialogDescription>
          {lightboxUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-0.5 py-0.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

function MessageBubble({
  message,
  isStreaming,
  onImageClick,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  onImageClick?: (url: string) => void;
}) {
  const isUser = message.role === "user";
  const blocks: MessageBlock[] = message.blocks ?? [];
  const isEmpty = !message.content && !blocks.length;

  return (
    <div className={isUser ? "flex min-w-0 justify-end" : "flex min-w-0 justify-start"}>
      <div
        className={
          isUser
            ? "min-w-0 max-w-[85%] overflow-hidden rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
            : "min-w-0 max-w-[90%] overflow-hidden rounded-lg bg-muted px-3 py-2 text-sm"
        }
      >
        {message.imagePreviewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.imagePreviewUrl}
            alt="Attached image"
            className="mb-2 max-h-32 w-full cursor-zoom-in rounded object-cover"
            onClick={() => onImageClick?.(message.imagePreviewUrl!)}
          />
        )}

        {blocks.length > 0 ? (
          <div className="flex flex-col gap-1">
            {blocks.map((block, i) => {
              if (block.type === "text") {
                return (
                  <span key={i} className="break-words whitespace-pre-wrap leading-relaxed">
                    {block.text}
                  </span>
                );
              }
              const isLastBlock = i === blocks.length - 1;
              return (
                <span
                  key={i}
                  className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  {isStreaming && isLastBlock ? (
                    <ThinkingDots />
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                  )}
                  <span className="truncate">{block.summary}</span>
                </span>
              );
            })}
          </div>
        ) : isUser && message.content ? (
          <span className="break-words whitespace-pre-wrap leading-relaxed">{message.content}</span>
        ) : !isUser && isEmpty && isStreaming ? (
          <ThinkingDots />
        ) : null}
      </div>
    </div>
  );
}
