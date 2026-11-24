import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;
const Base = ({ children, ...props }: IconProps & { children: React.ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
export function DownloadIcon(props: IconProps) { return <Base {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></Base>; }
export function MenuIcon(props: IconProps) { return <Base {...props}><path d="M4 6h16M4 12h16M4 18h16"/></Base>; }
export function PlusIcon(props: IconProps) { return <Base {...props}><path d="M12 5v14M5 12h14"/></Base>; }
export function SparkIcon(props: IconProps) { return <Base {...props}><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></Base>; }
export function WrenchIcon(props: IconProps) { return <Base {...props}><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18a2 2 0 0 0 3 3l5.3-5.3a5 5 0 0 0 6.4-6.4L14 11l-3-3 3.7-1.7Z"/></Base>; }
