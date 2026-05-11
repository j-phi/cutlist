import { describe, it, expect } from 'vitest';
import { generateHTML } from '@tiptap/html';
import { marketplaceExtensions } from '../marketplaceExtensions';

describe('marketplaceExtensions — youtube', () => {
  it('renders a youtube node as a nocookie iframe with the embedded video id', () => {
    const html = generateHTML(
      {
        type: 'doc',
        content: [
          {
            type: 'youtube',
            attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          },
        ],
      },
      marketplaceExtensions,
    );

    expect(html).toContain('data-youtube-video');
    expect(html).toContain('<iframe');
    expect(html).toContain(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  });
});
