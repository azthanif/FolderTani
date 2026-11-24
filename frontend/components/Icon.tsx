/* Ikon garis (diporting dari peta SVG app.js). String path statis dan tepercaya. */
const SVG: Record<string, string> = {
 "dashboard": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
 "wheat": "<path d=\"M12 22V8M8 6c0 2 2 3 4 3V6c-2 0-4-2-4-4-2 0-3 1-3 3s2 4 7 4M16 6c0 2-2 3-4 3V6c2 0 4-2 4-4 2 0 3 1 3 3s-2 4-7 4M5 12c2 0 4 1 7 4M19 12c-2 0-4 1-7 4\"/>",
 "handshake": "<path d=\"M7 11 9 9l3 2 2-2m-7 2-4 3m11-5 7 5-5 5-4-2-3 2-4-4m6-4 2 2m-2 0 2 2m-7-9 3-2 4 1 3-1 3 3-4 3\"/>",
 "chart": "<path d=\"M3 3v18h18M6 16l5-5 4 3 5-8\"/>",
 "history": "<path d=\"M3 12a9 9 0 1 0 2.5-6.2L3 8m0-5v5h5M12 7v5l3 2\"/>",
 "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4-4\"/>",
 "bell": "<path d=\"M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4\"/>",
 "menu": "<path d=\"M4 6h16M4 12h16M4 18h16\"/>",
 "close": "<path d=\"M18 6 6 18M6 6l12 12\"/>",
 "plus": "<path d=\"M12 5v14M5 12h14\"/>",
 "edit": "<path d=\"m15 5 4 4M3 21l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L3 21Z\"/>",
 "package": "<path d=\"m12 2 9 5-9 5-9-5 9-5ZM3 7v10l9 5 9-5V7M12 12v10\"/>",
 "trash": "<path d=\"M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6\"/>",
 "check": "<path d=\"m5 12 4 4L19 6\"/>",
 "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>",
 "activity": "<path d=\"M3 12h3l3-8 4 16 3-8h5\"/>",
 "send": "<path d=\"m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2\"/>",
 "location": "<path d=\"M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"2\"/>",
 "info": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v6M12 7h.01\"/>",
 "wallet": "<rect x=\"2\" y=\"5\" width=\"20\" height=\"16\" rx=\"2\"/><path d=\"M2 10h20M16 16h2M5 5V3h14\"/>",
 "refresh": "<path d=\"M20 7v5h-5M4 17v-5h5M5.7 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.3-3\"/>",
 "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/>",
 "document": "<path d=\"M5 2h10l4 4v16H5zM15 2v5h4M8 12h8M8 16h8\"/>",
 "sprout": "<path d=\"M7 20h10\"/><path d=\"M10 20c5.5-2.5.8-6.4 3-10\"/><path d=\"M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z\"/><path d=\"M14.1 6a7 7 0 0 1 1.1 4c-1.9-.1-3.5-.8-4.5-1.7\"/>",
 "truck": "<path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\"/><path d=\"M15 18H9\"/><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/>",
 "download": "<path d=\"M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4\"/>",
 "chevron": "<path d=\"m9 18 6-6-6-6\"/>",
 "database": "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0\"/>",
 "phone": "<path d=\"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z\"/>",
 "trending": "<path d=\"m3 17 7-7 4 4 7-7M15 7h6v6\"/>",
 "lock": "<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>",
 "user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21a8 8 0 0 1 16 0\"/>",
 "layout-dashboard": "<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/>",
 "chart-no-axes-combined": "<path d=\"M3 3v18h18\"/> <path d=\"m7 16 5-5 4 3 5-7\"/> <path d=\"M17 7h4v4\"/>",
 "receipt-text": "<path d=\"M4 3h16v18l-4-2-4 2-4-2-4 2V3Z\"/> <path d=\"M8 8h8\"/> <path d=\"M8 12h8\"/> <path d=\"M8 16h5\"/>",
 "messages-square": "<path d=\"M16 10a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\"/> <path d=\"M22 8v10a2 2 0 0 1-2 2h-6l-4 4v-4\"/>",
 "arrow-left-right": "<path d=\"M8 3 4 7l4 4\"/> <path d=\"M4 7h16\"/> <path d=\"m16 21 4-4-4-4\"/> <path d=\"M20 17H4\"/>",
 "refresh-cw": "<path d=\"M20 11a8 8 0 0 0-14.9-4\"/> <path d=\"M4 4v5h5\"/> <path d=\"M4 13a8 8 0 0 0 14.9 4\"/> <path d=\"M20 20v-5h-5\"/>",
 "message-circle-warning": "<path d=\"M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4.2-1.1L3 21 l1.8-5.2A8.5 8.5 0 1 1 21 11.5Z\"/> <path d=\"M12 7v5\"/> <path d=\"M12 16h.01\"/>",
 "package-plus": "<path d=\"m12 2 9 5-9 5-9-5 9-5Z\"/> <path d=\"M3 7v10l9 5 9-5V7\"/> <path d=\"M12 12v10\"/> <path d=\"M16 4h6\"/> <path d=\"M19 1v6\"/>"
};

export type IconName = keyof typeof SVG | string;

export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: SVG[name] ?? SVG.info }}
    />
  );
}

export const SVG_PATHS = SVG;
