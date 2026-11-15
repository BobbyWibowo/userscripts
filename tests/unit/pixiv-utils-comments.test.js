import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupPixivUtils,
  flush,
  loadFixture,
  loadPixivUtils
} from '../helpers/pixiv-utils-harness.js';

const COMMENT_LIST_MARKER = 'CommentList_rootList_';
const COMMENT_WRAPPER_MARKER = 'Comment_commentContentWrapper_';
const MODERATION_MARKER = 'data-pixiv_utils_moderation_blocked';

/**
 * The comment registration is the one whose selector mentions the comment
 * list class prefix.
 */
const commentListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes(COMMENT_LIST_MARKER));

  if (!entry) throw new Error('No comment sentinel callback registered.');

  return entry;
};

/** The UTags registration, keyed by its data-attribute selector. */
const utagsListener = pixiv => {
  const entry = pixiv.listeners.find(candidate =>
    String(candidate.selector).includes('data-utags_tag='));

  if (!entry) throw new Error('No UTags sentinel callback registered.');

  return entry;
};

/**
 * Render one comment item mirroring the live desktop structure (verified
 * against a page snapshot): root-list `li` → wrapper divs → a flex row holding
 * the avatar link and the content wrapper, whose first child is the name row,
 * followed by the body and action containers.
 *
 * The class hashes are intentionally made up: the code matches class names via
 * partial `[class*=...]` selectors, so the fixture proves no specific
 * server-generated hash is required.
 *
 * @param {object} [options]
 * @param {boolean} [options.avatar] Include the profile-popup avatar link.
 * @param {boolean} [options.wrapper] Include the comment content wrapper.
 * @param {string|null} [options.content] Markup for the name row (first div
 *   of the wrapper). Defaults to a plain-text username.
 */
const renderComment = ({ avatar = true, wrapper = true, content = null } = {}) => {
  const nameRow = content ??
    '<div class="text-text1 typography-14 font-bold flow-root">言言papa</div>';
  const body = `
        <div class="whitespace-pre-wrap text-text2 typography-14 flow-root"><div><p>Hot</p></div></div>
        <div class="Comment_commentActionContainer__PjIlU Comment_spa__UiNCu"><span>1 day ago</span><span>Reply</span></div>`;

  document.body.insertAdjacentHTML('beforeend', `
    <ul class="CommentList_rootList_k9d8e7f">
      <li id="test-comment">
        <div><div><div class="flex">
          ${avatar ? '<div class="mr-16"><a class="ui-profile-popup" href="/en/users/22444847"><div class="style_userIcon__ZKTI7"></div></a></div>' : ''}
          ${wrapper ? `<div class="Comment_commentContentWrapper_a1b2c3 space-y-8">${nameRow}${body}</div>` : ''}
        </div></div></li>
    </ul>`);

  return document.getElementById('test-comment');
};

const wrapperOf = li => li.querySelector(`div[class*="${COMMENT_WRAPPER_MARKER}"]`);

/**
 * Render a parent comment whose flex row is followed by the indented child
 * comment list, mirroring the live reply structure: `RootComment_indent` holds
 * a `ul.ChildCommentList_list` whose direct `li.ChildCommentList_item` children
 * repeat the avatar + content-wrapper layout.
 */
const renderNestedComment = ({ content = null } = {}) => {
  const nameRow = content ??
    '<div class="text-text1 typography-14 font-bold flow-root">返信者</div>';

  document.body.insertAdjacentHTML('beforeend', `
    <ul class="CommentList_rootList_k9d8e7f">
      <li id="parent-comment">
        <div><div>
          <div class="flex">
            <div class="mr-16"><a class="ui-profile-popup" href="/en/users/22444847"><div class="style_userIcon__ZKTI7"></div></a></div>
            <div class="Comment_commentContentWrapper_a1b2c3 space-y-8">
              <div class="text-text1 typography-14 font-bold flow-root">言言papa</div>
              <div class="whitespace-pre-wrap text-text2 typography-14 flow-root"><div><p>Hot</p></div></div>
              <div class="Comment_commentActionContainer__PjIlU Comment_spa__UiNCu"><span>1 day ago</span><span>Reply</span></div>
            </div>
          </div>
          <div class="RootComment_indent__OpcBT"><div>
            <ul class="ChildCommentList_list_x1y2z3">
              <li class="ChildCommentList_item_m4n5o6" id="nested-comment">
                <div class="flex">
                  <div class="mr-16"><a class="ui-profile-popup Comment_child__DjME2" href="/en/users/99887766"><div class="style_userIcon__ZKTI7"></div></a></div>
                  <div class="Comment_commentContentWrapper_p7q8r9 space-y-8">${nameRow}<div class="whitespace-pre-wrap text-text2 typography-14 flow-root"><div><p>Reply body</p></div></div></div>
                </div>
              </li>
            </ul>
          </div></div>
        </div></div>
      </li>
    </ul>`);

  return {
    parent: document.getElementById('parent-comment'),
    nested: document.getElementById('nested-comment')
  };
};

describe('pixiv-utils comment usernames', () => {
  beforeEach(() => {
    loadFixture();
  });

  afterEach(() => {
    cleanupPixivUtils();
  });

  it('registers the comment callback by default and skips it when linking is disabled', async () => {
    const defaults = await loadPixivUtils();
    const registered = commentListener(defaults);

    // Both the root-list and nested child-list selectors are registered.
    const selector = String(registered.selector);
    expect(selector).toContain('CommentList_rootList_');
    expect(selector).toContain('ChildCommentList_list_');

    cleanupPixivUtils();

    const disabled = await loadPixivUtils({ settings: { LINK_COMMENT_USERNAMES: false } });
    const entry = disabled.listeners.find(candidate =>
      String(candidate.selector).includes(COMMENT_LIST_MARKER));

    expect(entry).toBeUndefined();
  });

  it('wraps the comment username in a link to the commenter profile', async () => {
    const pixiv = await loadPixivUtils();
    const li = renderComment();
    const avatar = li.querySelector('a');

    await pixiv.fireListener(commentListener(pixiv), li);
    await flush(4);

    const link = wrapperOf(li).querySelector('a');

    expect(link).not.toBeNull();
    expect(link.href).toBe(avatar.href);
    expect(link.textContent).toBe('言言papa');
    // The avatar link itself is left alone.
    expect(li.querySelectorAll('a')).toHaveLength(2);
  });

  it('keeps the Author badge outside the username link', async () => {
    const pixiv = await loadPixivUtils();
    const li = renderComment({
      content: '<div class="text-text1 typography-14 font-bold flow-root">Z282g' +
        '<span class="Comment_badge__pGPe1 Comment_creator__xv79n">Author</span></div>'
    });

    await pixiv.fireListener(commentListener(pixiv), li);
    await flush(4);

    const link = wrapperOf(li).querySelector('a');
    const badge = li.querySelector('[class*="Comment_badge"]');

    expect(link.textContent).toBe('Z282g');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Author');
    // The badge stays a plain sibling of the link inside the name row.
    expect(badge.closest('a')).toBeNull();
  });

  it('links only the first non-empty text node of the comment content', async () => {
    const pixiv = await loadPixivUtils();
    const li = renderComment({ content: '<div>   <b>sticker</b>言言papa</div>' });

    await pixiv.fireListener(commentListener(pixiv), li);
    await flush(4);

    // `doComment` targets the wrapper's first child div, not the wrapper itself.
    const container = wrapperOf(li).firstElementChild;

    // Leading whitespace and the sticker element stay untouched...
    expect(container.firstChild.nodeType).toBe(Node.TEXT_NODE);
    expect(container.querySelector('b')).not.toBeNull();

    // ...while the username text becomes the linked node.
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.textContent).toBe('言言papa');
    expect(link.querySelector('b')).toBeNull();
  });

  it('leaves comments without a user link untouched', async () => {
    const pixiv = await loadPixivUtils();
    const li = renderComment({ avatar: false });

    await pixiv.fireListener(commentListener(pixiv), li);
    await flush(4);

    const wrapper = wrapperOf(li);

    expect(wrapper.querySelector('a')).toBeNull();
    expect(wrapper.firstElementChild.textContent).toBe('言言papa');
  });

  it('leaves comments without the content wrapper untouched', async () => {
    const pixiv = await loadPixivUtils();
    const li = renderComment({ wrapper: false });

    await expect(pixiv.fireListener(commentListener(pixiv), li)).resolves.toBeUndefined();
    await flush(4);

    // Only the avatar link exists; nothing was added or removed.
    expect(li.querySelectorAll('a')).toHaveLength(1);
  });

  it('hides comments carrying a blocked UTag even when username linking is disabled', async () => {
    const pixiv = await loadPixivUtils({ settings: { LINK_COMMENT_USERNAMES: false } });
    const li = renderComment({
      content: '<div>spammer<span data-utags_tag="block"></span></div>'
    });
    const marker = li.querySelector('[data-utags_tag="block"]');

    await pixiv.fireListener(utagsListener(pixiv), marker);
    await flush(4);

    expect(li.style.display).toBe('none');
    expect(li.getAttribute(MODERATION_MARKER)).toBe('true');
    // Linking is off, so the username text stays plain.
    expect(wrapperOf(li).querySelector('a')).toBeNull();
  });

  it('links usernames in nested child comments without mixing up parent and reply data', async () => {
    const pixiv = await loadPixivUtils();
    const { parent, nested } = renderNestedComment();

    await pixiv.fireListener(commentListener(pixiv), parent);
    await pixiv.fireListener(commentListener(pixiv), nested);
    await flush(4);

    const parentLink = wrapperOf(parent).querySelector('a');
    const nestedLink = wrapperOf(nested).querySelector('a');

    expect(parentLink.href).toBe(parent.querySelector('a').href);
    expect(parentLink.textContent).toBe('言言papa');
    expect(nestedLink.href).toBe(nested.querySelector('a').href);
    expect(nestedLink.textContent).toBe('返信者');
  });

  it('hides a nested comment carrying a blocked UTag without touching its parent', async () => {
    const pixiv = await loadPixivUtils();
    const { parent, nested } = renderNestedComment({
      content: '<div>spammer<span data-utags_tag="block"></span></div>'
    });
    const marker = nested.querySelector('[data-utags_tag="block"]');

    await pixiv.fireListener(utagsListener(pixiv), marker);
    await flush(4);

    expect(nested.style.display).toBe('none');
    expect(nested.getAttribute(MODERATION_MARKER)).toBe('true');

    // The closest match is the nested item, so the parent stays visible.
    expect(parent.style.display).toBe('');
    expect(parent.hasAttribute(MODERATION_MARKER)).toBe(false);
  });
});
