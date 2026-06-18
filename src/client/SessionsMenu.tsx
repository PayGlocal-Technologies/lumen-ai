"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@payglocal_ui/flux-ui";
import { Icon } from "./icon.js";
import type { Conversation } from "./useAgentChat.js";

interface Props {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionsMenu({ conversations, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitEdit = () => {
    if (editingId) onRename(editingId, editName);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sessions</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            isActive={c.id === activeId}
            isEditing={editingId === c.id}
            editName={editName}
            onSelect={() => { if (editingId !== c.id) onSelect(c.id); }}
            onStartEdit={() => startEdit(c.id, c.name)}
            onEditChange={setEditName}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            onDelete={() => onDelete(c.id)}
          />
        ))}
      </div>

      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-xs"
          leftIcon={<Icon name="plus" className="h-3.5 w-3.5" />}
          onClick={onCreate}
        >
          New Chat
        </Button>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  isActive,
  isEditing,
  editName,
  onSelect,
  onStartEdit,
  onEditChange,
  onCommitEdit,
  onCancelEdit,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const isInterrupted =
    !isActive &&
    lastMsg?.role === "assistant" &&
    lastMsg.blocks?.some((b) => b.type === "tool") &&
    !lastMsg.blocks?.some((b) => b.type === "text");

  return (
    <div
      className={`group flex cursor-pointer items-center gap-1 px-3 py-2 hover:bg-muted ${isActive ? "bg-muted" : ""}`}
      onClick={onSelect}
    >
      {isActive && !isEditing && (
        <Icon name="message-circle" className="h-3.5 w-3.5 shrink-0 text-primary" />
      )}
      {isInterrupted && !isEditing && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-500/20"
          title="Session was interrupted"
        />
      )}

      {isEditing ? (
        <Input
          ref={inputRef}
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommitEdit(); }
            if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-6 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
      ) : (
        <span className="flex-1 truncate text-sm">{conversation.name}</span>
      )}

      {!isEditing && (
        <div
          className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            title="Rename"
            onClick={onStartEdit}
          >
            <Icon name="pencil" className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:text-destructive"
            title="Delete"
            onClick={onDelete}
          >
            <Icon name="trash-2" className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
