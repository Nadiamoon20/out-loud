/**
 * نوار گفت‌وگو — عنصر امضادار طراحی.
 * از چپ به راست، طی جلسه رشد می‌کند: کهربایی هر جا تو حرف زدی، فیروزه‌ای
 * هر جا طرف مقابل. تنها عددی که واقعاً در یادگیری زبان مهم است را
 * یک‌نگاه نشان می‌دهد — چقدرش را خودت گفتی؟
 */
export class Ribbon {
  constructor(container) {
    this.container = container;
    this.segments = [];
  }

  reset() {
    this.segments = [];
    this.render();
  }

  addSegment(role, wordCount) {
    if (!wordCount || wordCount <= 0) return;
    this.segments.push({ role, wordCount });
    this.render();
  }

  totalWords() {
    return this.segments.reduce((sum, s) => sum + s.wordCount, 0);
  }

  youPercent() {
    const total = this.totalWords();
    if (total === 0) return 0;
    const youWords = this.segments
      .filter((s) => s.role === 'user')
      .reduce((sum, s) => sum + s.wordCount, 0);
    return Math.round((youWords / total) * 100);
  }

  render() {
    this.container.innerHTML = '';
    const total = this.totalWords();
    if (total === 0) return;
    for (const seg of this.segments) {
      const el = document.createElement('div');
      el.className = `ribbon-seg ${seg.role === 'user' ? 'you' : 'partner'}`;
      el.style.flexBasis = `${(seg.wordCount / total) * 100}%`;
      this.container.appendChild(el);
    }
  }
}
