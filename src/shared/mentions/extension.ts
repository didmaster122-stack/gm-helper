// The `mention` node of the editors: `@` opens a list of objects, the node shows the current
// name of the object and opens it on a click.
import { Mention, type MentionNodeAttrs, type MentionOptions } from "@tiptap/extension-mention";
import { create } from "zustand";
import { ru } from "../i18n/ru";
import { findMentionTargets, isMentionKind, type MentionTarget } from "./domain";
import { mentionTitle, openMention, refreshMentions, useMentionStore } from "./store";

const LIST_LIMIT = 8;

/** Attributes of the node the editor stores. */
export interface MentionAttrs {
  id: string;
  kind: string;
  label: string;
}

interface MenuState {
  items: MentionTarget[];
  index: number;
  /** Where the typed `@query` is on screen. */
  rect: DOMRect | null;
  pick: ((target: MentionTarget) => void) | null;
}

const closed: MenuState = { items: [], index: 0, rect: null, pick: null };

/** The open `@` list (one at a time), drawn by `MentionMenu`. */
export const useMentionMenu = create<MenuState>(() => closed);

type Suggestion = MentionOptions<MentionTarget>["suggestion"];
type SuggestionRender = NonNullable<ReturnType<NonNullable<Suggestion["render"]>>>;
type RenderProps = Parameters<NonNullable<SuggestionRender["onStart"]>>[0];

function show(props: RenderProps) {
  const index = useMentionMenu.getState().index;
  useMentionMenu.setState({
    items: props.items,
    index: Math.min(index, Math.max(props.items.length - 1, 0)),
    rect: props.clientRect?.() ?? null,
    pick: (target) => {
      const attrs: MentionNodeAttrs & { kind: string } = {
        id: target.id,
        kind: target.kind,
        label: target.title,
      };
      props.command(attrs);
    },
  });
}

const suggestion: Suggestion = {
  char: "@",
  items: ({ query }) => findMentionTargets(useMentionStore.getState().targets, query, LIST_LIMIT),
  render: () => ({
    onStart: (props) => {
      useMentionMenu.setState({ index: 0 });
      show(props);
      void refreshMentions();
    },
    onUpdate: show,
    onExit: () => useMentionMenu.setState(closed),
    onKeyDown: ({ event }) => {
      const { items, index, pick } = useMentionMenu.getState();
      if (items.length === 0) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        useMentionMenu.setState({ index: (index + step + items.length) % items.length });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[index];
        if (item) pick?.(item);
        return true;
      }
      return false;
    },
  }),
};

function readAttrs(attrs: Record<string, unknown>): MentionAttrs {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return { id: text(attrs.id), kind: text(attrs.kind), label: text(attrs.label) };
}

export const MentionNode = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-kind"),
        renderHTML: (attributes: Record<string, unknown>) =>
          typeof attributes.kind === "string" ? { "data-kind": attributes.kind } : {},
      },
    };
  },

  addNodeView() {
    return ({ node }) => {
      const { id, kind } = readAttrs(node.attrs);
      let label = readAttrs(node.attrs).label;
      const dom = document.createElement("span");
      dom.className = "mention";
      dom.contentEditable = "false";
      const update = () => {
        const title = mentionTitle(id);
        dom.textContent = `@${title ?? label}`;
        const missing = title === null;
        dom.classList.toggle("missing", missing);
        dom.title = missing ? ru.mentions.missing : ru.mentions.open;
      };
      update();
      const unsubscribe = useMentionStore.subscribe(update);
      dom.addEventListener("click", (event) => {
        event.preventDefault();
        if (isMentionKind(kind)) openMention(kind, id);
      });
      return {
        dom,
        update: (next) => {
          const attrs = readAttrs(next.attrs);
          if (next.type !== node.type || attrs.id !== id || attrs.kind !== kind) return false;
          label = attrs.label;
          update();
          return true;
        },
        destroy: unsubscribe,
      };
    };
  },
}).configure({
  renderText: ({ node }) => `@${readAttrs(node.attrs).label}`,
  suggestion,
});
