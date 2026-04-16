import { formatImageUrl, formatImageUrlWithThumbnail } from '@/helpers/image';

/**
 * rich-text node type definitions
 * Reference: https://uniapp.dcloud.net.cn/component/rich-text.html
 */
export type RichTextNode = RichTextElementNode | RichTextTextNode;

export interface RichTextElementNode {
  type?: 'node';
  name: string;
  attrs?: Record<string, string>;
  children?: RichTextNode[];
}

export interface RichTextTextNode {
  type: 'text';
  text: string;
}

// ─── Lightweight HTML Parser ─────────────────────────────────────────────────────
// Ported from the official DCloud hello-uniapp example:
// https://github.com/dcloudio/hello-uniapp/blob/master/common/html-parser.js
// Original authors: John Resig / Erik Arvidsson / Sam Blowes, triple open-source license (Apache 2.0 / MPL / GPL)

// Self-closing tags
const EMPTY_TAGS: Record<string, boolean> = makeTagSet(
  'area,base,basefont,br,col,frame,hr,img,input,link,meta,param,embed,command,keygen,source,track,wbr',
);
// Block-level tags (starting one should close nested inline tags)
const BLOCK_TAGS: Record<string, boolean> = makeTagSet(
  'a,address,article,applet,aside,audio,blockquote,button,canvas,center,dd,del,' +
    'dir,div,dl,dt,fieldset,figcaption,figure,footer,form,frameset,h1,h2,h3,h4,h5,h6,' +
    'header,hgroup,hr,iframe,isindex,li,map,menu,noframes,noscript,object,ol,output,p,' +
    'pre,section,script,table,tbody,td,tfoot,th,thead,tr,ul,video',
);
// Inline tags
const INLINE_TAGS: Record<string, boolean> = makeTagSet(
  'abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code,del,dfn,em,font,i,' +
    'iframe,img,input,ins,kbd,label,map,object,q,s,samp,script,select,small,span,' +
    'strike,strong,sub,sup,textarea,tt,u,var',
);
// Optionally closable tags that auto-close
const CLOSE_SELF_TAGS: Record<string, boolean> = makeTagSet(
  'colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr',
);
// Boolean attributes (no value; attribute name is the value)
const FILL_ATTRS: Record<string, boolean> = makeTagSet(
  'checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected',
);
// Special tags whose content should not be parsed
const SPECIAL_TAGS: Record<string, boolean> = makeTagSet('script,style');

function makeTagSet(str: string): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  for (const s of str.split(',')) {
    obj[s] = true;
  }
  return obj;
}

interface RawAttr {
  name: string;
  value: string;
}

interface ParserHandler {
  start: (tag: string, attrs: RawAttr[], unary: boolean) => void;
  end: (tag: string) => void;
  chars: (text: string) => void;
}

// Parse a start tag: <tagName attrs... />
// Attribute values support three forms: double-quoted, single-quoted, and unquoted (unquoted uses [^\s>]+ to avoid overlapping with quoted forms)
const RE_START_TAG =
  /^<([-\w]+)((?:\s+[\w:][-\w:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/;
// Parse an end tag: </tagName>
const RE_END_TAG = /^<\/([-\w][^>]*)>/;
// Parse a single key=value attribute (global mode; reset lastIndex before each call)
const RE_ATTR = /([\w:][-\w:.]*)(?:\s*=\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s"'>]+)))?/g;
// Strip CDATA / comments (]] is escaped to avoid false lint positives)
const RE_CDATA_COMMENT = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;

function htmlParser(rawHtml: string, handler: ParserHandler): void {
  const stack: string[] = [];
  let html = rawHtml;
  let last = html;

  function stackLast(): string | undefined {
    return stack.at(-1);
  }

  while (html) {
    let chars = true;

    if (!stackLast() || !SPECIAL_TAGS[stackLast()!]) {
      if (html.startsWith('<!--')) {
        const index = html.indexOf('-->');
        if (index >= 0) {
          html = html.substring(index + 3);
          chars = false;
        }
      } else if (html.startsWith('</')) {
        const match = html.match(RE_END_TAG);
        if (match) {
          html = html.substring(match[0].length);
          parseEndTag(match[1]);
          chars = false;
        }
      } else if (html.startsWith('<')) {
        const match = html.match(RE_START_TAG);
        if (match) {
          html = html.substring(match[0].length);
          parseStartTag(match[1], match[2], !!match[3]);
          chars = false;
        }
      }

      if (chars) {
        const index = html.indexOf('<');
        const text = index < 0 ? html : html.substring(0, index);
        html = index < 0 ? '' : html.substring(index);
        if (text) {
          handler.chars(text);
        }
      }
    } else {
      // Special tags (script/style): treat their content as plain text
      const lastTag = stackLast()!;
      html = html.replace(
        new RegExp(`([\\s\\S]*?)<\\/${lastTag}[^>]*>`),
        (_all: string, text: string) => {
          RE_CDATA_COMMENT.lastIndex = 0;
          const cleaned = text.replace(RE_CDATA_COMMENT, '');
          if (cleaned) {
            handler.chars(cleaned);
          }
          return '';
        },
      );
      parseEndTag(lastTag);
    }

    if (html === last) {
      break;
    }
    last = html;
  }

  parseEndTag('');

  function parseStartTag(tagName: string, rest: string, selfClose: boolean): void {
    const tag = tagName.toLowerCase();

    if (BLOCK_TAGS[tag]) {
      while (stackLast() && INLINE_TAGS[stackLast()!]) {
        parseEndTag(stackLast()!);
      }
    }
    if (CLOSE_SELF_TAGS[tag] && stackLast() === tag) {
      parseEndTag(tag);
    }

    const unary = !!EMPTY_TAGS[tag] || selfClose;
    if (!unary) {
      stack.push(tag);
    }

    const attrs: RawAttr[] = [];
    RE_ATTR.lastIndex = 0;
    for (let m = RE_ATTR.exec(rest); m !== null; m = RE_ATTR.exec(rest)) {
      const value = m[2] ?? m[3] ?? m[4] ?? (FILL_ATTRS[m[1]] ? m[1] : '');
      attrs.push({ name: m[1], value });
    }

    handler.start(tag, attrs, unary);
  }

  function parseEndTag(tagName: string): void {
    let pos: number;
    if (!tagName) {
      pos = 0;
    } else {
      pos = stack.length - 1;
      while (pos >= 0 && stack[pos] !== tagName) {
        pos--;
      }
    }
    if (pos >= 0) {
      for (let i = stack.length - 1; i >= pos; i--) {
        handler.end(stack[i]);
      }
      stack.length = pos;
    }
  }
}

// ─── HTML -> rich-text node conversion ───────────────────────────────────────────

/**
 * Set of trusted HTML tags supported by uni-app rich-text.
 * Tags outside this set cannot be rendered directly and must use the "lift children" strategy.
 */
const TRUSTED_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'code',
  'col',
  'colgroup',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'label',
  'legend',
  'li',
  'ol',
  'p',
  'q',
  'span',
  'strong',
  'sub',
  'source',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
  'video',
]);

// Extra allowed attributes for each tag beyond class/style
const EXTRA_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target']),
  img: new Set(['src', 'alt', 'width', 'height']),
  source: new Set(['src', 'type']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span', 'width']),
  td: new Set(['colspan', 'rowspan', 'height', 'width']),
  th: new Set(['colspan', 'rowspan', 'height', 'width']),
  ol: new Set(['start', 'type']),
  table: new Set(['width']),
  video: new Set(['src', 'poster', 'controls', 'autoplay', 'loop', 'muted']),
};

const GLOBAL_ATTRS = new Set(['class', 'style']);

function filterRawAttrs(tagName: string, rawAttrs: RawAttr[]): Record<string, string> | undefined {
  const extra = EXTRA_ATTRS[tagName];
  const result: Record<string, string> = {};
  for (const { name, value } of rawAttrs) {
    if (GLOBAL_ATTRS.has(name) || extra?.has(name)) {
      result[name] =
        tagName === 'img' && name === 'src'
          ? formatImageUrlWithThumbnail(value, 'L')
          : tagName === 'video' && (name === 'src' || name === 'poster')
            ? formatImageUrl(value)
            : tagName === 'source' && name === 'src'
              ? formatImageUrl(value)
              : value;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

/**
 * Mixed content blocks: rich-text node paragraphs or standalone images
 *
 * In Mini Program, images inside rich-text cannot trigger events,
 * so the HTML is split into two alternating block types: "rich-text nodes" and "images",
 * and images are rendered with the native image component to support preview and other interactions.
 */
export type RichContentBlock =
  | { type: 'rich'; nodes: RichTextNode[] }
  | {
      type: 'image';
      src: string;
      alt?: string;
      wrapperStyle?: string;
      wrapperClass?: string;
      contentType?: string;
    }
  | {
      type: 'video';
      src: string;
      poster?: string;
      wrapperStyle?: string;
      wrapperClass?: string;
      contentType?: string;
    };

function pickAttr(rawAttrs: RawAttr[], name: string): string | undefined {
  return rawAttrs.find((attr) => attr.name === name)?.value;
}

function getMediaWrapperAttrs(attrs: Record<string, string> | undefined) {
  return {
    wrapperStyle: attrs?.['data-wrapper-style'],
    wrapperClass: attrs?.['data-wrapper-class'],
    contentType: attrs?.['data-content-type'],
  };
}

function resolveVideoSrc(node: RichTextElementNode): string {
  const directSrc = node.attrs?.src;
  if (directSrc) {
    return directSrc;
  }
  const sourceNode = node.children?.find(
    (child): child is RichTextElementNode => child.type !== 'text' && child.name === 'source',
  );
  return sourceNode?.attrs?.src ?? '';
}

/**
 * Parse an HTML string into an array of mixed content blocks.
 * Top-level img elements are extracted into standalone image blocks, while the rest stays in rich-text node blocks.
 */
export function htmlToContentBlocks(html: string): RichContentBlock[] {
  if (!html) {
    return [];
  }

  const nodes = htmlToRichTextNodes(html);
  const blocks: RichContentBlock[] = [];
  let richBuffer: RichTextNode[] = [];

  function flushRich() {
    if (richBuffer.length) {
      blocks.push({ type: 'rich', nodes: richBuffer });
      richBuffer = [];
    }
  }

  for (const node of nodes) {
    if (node.type !== 'text' && (node as RichTextElementNode).name === 'img') {
      flushRich();
      const imgNode = node as RichTextElementNode;
      const wrapperAttrs = getMediaWrapperAttrs(imgNode.attrs);
      blocks.push({
        type: 'image',
        src: imgNode.attrs?.src ?? '',
        alt: imgNode.attrs?.alt,
        ...wrapperAttrs,
      });
    } else if (node.type !== 'text' && (node as RichTextElementNode).name === 'video') {
      flushRich();
      const videoNode = node as RichTextElementNode;
      const wrapperAttrs = getMediaWrapperAttrs(videoNode.attrs);
      blocks.push({
        type: 'video',
        src: resolveVideoSrc(videoNode),
        poster: videoNode.attrs?.poster,
        ...wrapperAttrs,
      });
    } else {
      richBuffer.push(node);
    }
  }

  flushRich();
  return blocks;
}

/**
 * Parse an HTML string into an array of nodes supported by uni-app rich-text (works across platforms).
 *
 * - Uses a lightweight HTML parser ported from DCloud hello-uniapp, so no DOMParser is required and it also works in Mini Program
 * - Untrusted tags (such as figure and section) use the "lift children" strategy, so child nodes like img are not dropped together with the wrapper
 */
export function htmlToRichTextNodes(html: string): RichTextNode[] {
  if (!html) {
    return [];
  }

  interface StackFrame {
    tagName: string;
    trusted: boolean;
    children: RichTextNode[];
    rawAttrs?: RawAttr[];
  }

  const frameStack: StackFrame[] = [{ tagName: '__root__', trusted: true, children: [] }];

  /** Return the children of the nearest trusted frame so nodes can be mounted in the correct place */
  function currentChildren(): RichTextNode[] {
    for (let i = frameStack.length - 1; i >= 0; i--) {
      if (frameStack[i].trusted) {
        return frameStack[i].children;
      }
    }
    return frameStack[0].children;
  }

  function currentMediaWrapper(): StackFrame | undefined {
    for (let i = frameStack.length - 1; i >= 0; i--) {
      const frame = frameStack[i];
      if (!frame.trusted && frame.tagName === 'figure') {
        return frame;
      }
    }
    return undefined;
  }

  htmlParser(html, {
    start(tagName, rawAttrs, unary) {
      const trusted = TRUSTED_TAGS.has(tagName);
      const node: RichTextElementNode = { name: tagName };
      const attrs = filterRawAttrs(tagName, rawAttrs);
      if (attrs) {
        node.attrs = attrs;
      }

      if (tagName === 'img' || tagName === 'video') {
        const wrapper = currentMediaWrapper();
        if (wrapper?.rawAttrs?.length) {
          node.attrs = {
            ...(node.attrs ?? {}),
            ...(pickAttr(wrapper.rawAttrs, 'style')
              ? { 'data-wrapper-style': pickAttr(wrapper.rawAttrs, 'style')! }
              : {}),
            ...(pickAttr(wrapper.rawAttrs, 'class')
              ? { 'data-wrapper-class': pickAttr(wrapper.rawAttrs, 'class')! }
              : {}),
            ...(pickAttr(wrapper.rawAttrs, 'data-content-type')
              ? { 'data-content-type': pickAttr(wrapper.rawAttrs, 'data-content-type')! }
              : {}),
          };
        }
      }

      if (trusted) {
        currentChildren().push(node);
      }

      if (!unary) {
        const children: RichTextNode[] = [];
        if (trusted) {
          node.children = children;
        }
        // Untrusted tag: push it onto the stack, but point its children to the parent's trusted children for passthrough rendering
        frameStack.push({
          tagName,
          trusted,
          children: trusted ? children : currentChildren(),
          rawAttrs,
        });
      }
    },
    end(_tagName) {
      if (frameStack.length > 1) {
        frameStack.pop();
      }
    },
    chars(text) {
      if (text.trim()) {
        currentChildren().push({ type: 'text', text });
      }
    },
  });

  return frameStack[0].children;
}
