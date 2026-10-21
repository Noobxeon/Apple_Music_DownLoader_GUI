<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>
<script>
const icons = {
  music: ['M9 18V5l12-2v13', 'M9 8l12-2', 'M9 18a3 3 0 1 1-3-3c1.65 0 3 1.35 3 3Z', 'M21 16a3 3 0 1 1-3-3c1.65 0 3 1.35 3 3Z'],
  search: ['M21 21l-5-5', 'M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 15v5h16v-5'],
  link: ['m10 13 4-4', 'M8 15l-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0', 'M13 17a3.5 3.5 0 0 0 5 0l5-5a3.5 3.5 0 0 0-5-5l-2 2'],
  settings: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'm10 2-1 3-3 1-3-1-2 4 2 3v2l-2 3 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-2-3v-2l2-3-2-4-3 1-3-1-1-3Z'],
  arrow: ['M4 12h16', 'm14 6 6 6-6 6'],
  check: ['m5 12 4 4L19 6'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  folder: ['M3 7V4h6l2 3h10v13H3Z'],
  play: ['m9 5 11 7-11 7Z'],
  pause: ['M8 5v14', 'M16 5v14'],
  refresh: ['M20 8a8 8 0 1 0 0 9', 'M20 3v5h-5'],
  info: ['M12 11v6', 'M12 7h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  user: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M4 21v-3a8 8 0 0 1 16 0v3'],
  album: ['M3 3h18v18H3Z', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M12 12h.01'],
  headphones: ['M3 14v-3a9 9 0 0 1 18 0v3', 'M3 12h4v9H3Z', 'M17 12h4v9h-4Z'],
  spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
  shield: ['m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z', 'm8 12 3 3 5-6'],
  volume: ['M11 4 6 8H2v8h4l5 4Z', 'M15 8a6 6 0 0 1 0 8', 'M18 5a10 10 0 0 1 0 14'],
  chevron: ['m9 5 7 7-7 7'],
  clock: ['M12 7v5l3 2', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7']
};
export default {
  props: { name: { type: String, default: 'music' }, size: { type: [Number, String], default: 20 } },
  computed: { paths() { return icons[this.name] || icons.music; } }
};
</script>
