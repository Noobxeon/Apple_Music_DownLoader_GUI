// Apple Music's subscription catalog differs from the legacy iTunes Store.
function parseCatalogPage(html, country) {
  const match = html.match(/<script\b(?=[^>]*\bid=["']serialized-server-data["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Apple Music 搜索页面格式已变化，请稍后重试');
  const payload = JSON.parse(match[1]);
  const entry = payload.data?.find(entry => Array.isArray(entry.data?.sections));
  if (entry?.intent?.$kind !== 'SearchResultsPageIntent' || entry.intent.storefront !== country) {
    throw new Error('Apple Music 搜索被重定向，请检查网络或稍后重试');
  }
  const page = entry?.data;
  if (!page) throw new Error('Apple Music 搜索响应缺少曲库数据');
  const results = new Map();
  const linkText = links => Array.isArray(links) ? links.map(link => link.title || '').filter(Boolean).join(' / ') : '';
  for (const section of page.sections) {
    for (const item of section.items || []) {
      const content = item.contentDescriptor;
      if (!content || !['song', 'album'].includes(content.kind)) continue;
      const id = String(content.identifiers?.storeAdamID || '');
      if (!/^\d+$/.test(id)) continue;
      let url;
      try { url = new URL(content.url); } catch { continue; }
      if (url.protocol !== 'https:' || url.hostname !== 'music.apple.com' || url.username || url.password || url.port ||
          !url.pathname.startsWith(`/${country}/`)) continue;
      const title = item.title || linkText(item.titleLinks);
      if (!title) continue;
      const artwork = item.artwork?.dictionary?.url || '';
      const cover = artwork.startsWith('https://') ? artwork.replaceAll('{w}', '600').replaceAll('{h}', '600').replaceAll('{f}', 'jpg') : '';
      const artist = linkText(item.subtitleLinks) || (item.subtitle || '').replace(/^.*?[· ]\s*/, '').trim();
      const key = content.kind + ':' + id;
      const previous = results.get(key);
      results.set(key, { id, type: content.kind === 'song' ? '歌曲' : '专辑', title,
        artist: artist || previous?.artist || '未知艺术家',
        album: content.kind === 'album' ? title : linkText(item.tertiaryLinks) || previous?.album || '',
        cover: cover || previous?.cover || '', url: url.href, previewUrl: '' });
    }
  }
  return [...results.values()];
}

async function searchCatalog(fetch, term, country = 'cn') {
  if (!/^[a-z]{2}$/.test(country)) throw new Error('无效的搜索地区');
  try {
  const response = await fetch(`https://music.apple.com/${country}/search?term=${encodeURIComponent(term)}`,
    { signal: AbortSignal.timeout(20000), headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
  if (!response.ok) throw new Error('Apple Music 搜索服务暂不可用，请稍后重试');
  return parseCatalogPage(await response.text(), country);
  } catch (error) {
    // Some networks redirect other storefronts to the local home page. Keep the
    // existing Store search for those regions; it cannot fill CN catalog gaps.
    if (country === 'cn') throw error;
    const responses = await Promise.all(['song', 'album'].map(entity => fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&entity=${entity}&limit=100`,
      { signal: AbortSignal.timeout(20000) })));
    if (responses.some(response => !response.ok)) throw error;
    const data = await Promise.all(responses.map(response => response.json()));
    return data.flatMap(value => value.results || []).map(item => ({
      id: String(item.trackId || item.collectionId), type: item.wrapperType === 'track' ? '歌曲' : '专辑',
      title: item.trackName || item.collectionName, artist: item.artistName || '未知艺术家',
      album: item.collectionName || '', cover: item.artworkUrl100?.replace('100x100bb', '600x600bb') || '',
      url: (item.trackViewUrl || item.collectionViewUrl || '').replace('https://itunes.apple.com/', 'https://music.apple.com/'),
      previewUrl: item.previewUrl || ''
    }));
  }
}

module.exports = { parseCatalogPage, searchCatalog };
