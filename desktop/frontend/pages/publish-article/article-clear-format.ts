import type { Editor } from "@tiptap/react";
import { Fragment, type Node } from "@tiptap/pm/model";
import { AllSelection, TextSelection } from "@tiptap/pm/state";

/** 全文清理直接展开结构，避免逐层提升嵌套列表时留下外层容器与空段落。 */
export function clearArticleFormatting(editor: Editor) {
  const { selection, doc } = editor.state;
  const wholeDocument =
    selection.empty ||
    (selection.from <= 1 && selection.to >= doc.content.size - 1);
  const chain = editor.chain().focus();
  if (selection.empty) {
    chain.selectAll();
  }
  chain.unsetAllMarks({ ignoreClearable: true });
  if (!wholeDocument) {
    return chain
      .clearNodes()
      .command(({ tr }) => {
        tr.setStoredMarks([]);
        return true;
      })
      .run();
  }
  return chain
    .command(({ tr, state }) => {
      const blocks: Node[] = [];
      const withoutMarks = (node: Node): Node => {
        if (node.isLeaf) {
          return node.mark([]);
        }
        const children: Node[] = [];
        node.forEach((child) => {
          children.push(withoutMarks(child));
        });
        return node.copy(Fragment.fromArray(children)).mark([]);
      };
      const visit = (node: Node) => {
        if (node.isTextblock) {
          const clean = withoutMarks(node);
          blocks.push(state.schema.nodes.paragraph.create(null, clean.content));
        } else if (node.isLeaf) {
          blocks.push(node.mark([]));
        } else {
          node.forEach(visit);
        }
      };
      tr.doc.forEach(visit);
      tr.replaceWith(0, tr.doc.content.size, blocks);
      tr.setSelection(
        selection.empty
          ? TextSelection.atEnd(tr.doc)
          : new AllSelection(tr.doc),
      );
      tr.setStoredMarks([]);
      return true;
    })
    .run();
}
