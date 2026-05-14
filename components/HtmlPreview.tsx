import React, { useEffect, useRef, useState } from 'react';
import { CopyIcon, CodeIcon, EyeIcon, MaximizeIcon, MinimizeIcon } from './Icons';

interface HtmlPreviewProps {
    html: string;
    title?: string;
}

export const HtmlPreview: React.FC<HtmlPreviewProps> = ({ html, title = 'Canvas Preview' }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
    const [copied, setCopied] = useState(false);
    const [displayTitle, setDisplayTitle] = useState(title);

    useEffect(() => {
        if (html) {
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                setDisplayTitle(titleMatch[1]);
            } else {
                setDisplayTitle(title);
            }
        }
    }, [html, title]);

    useEffect(() => {
        if (activeTab === 'preview' && iframeRef.current) {
            const doc = iframeRef.current.contentDocument;
            if (doc) {
                doc.open();
                doc.write(html);
                doc.close();
            }
        }
    }, [html, activeTab]);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(html);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    return (
        <div className={`rounded-xl overflow-hidden border border-white/10 bg-bg-onyx mt-4 flex flex-col ${isFullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'relative aspect-video'}`}>
            <div className="flex-shrink-0 bg-black/50 backdrop-blur-sm flex items-center justify-between px-4 border-b border-white/10 z-10 h-11">
                <div className="flex items-center gap-4">
                    <span className="text-xs font-semibold text-white/90 truncate max-w-[120px] sm:max-w-none">{displayTitle}</span>
                    <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
                        <button
                            onClick={() => setActiveTab('preview')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${activeTab === 'preview' ? 'bg-accent/20 text-accent shadow-sm' : 'text-white/60 hover:text-white'}`}
                        >
                            <EyeIcon className="w-3.5 h-3.5" />
                            <span>Önizləmə</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${activeTab === 'code' ? 'bg-accent/20 text-accent shadow-sm' : 'text-white/60 hover:text-white'}`}
                        >
                            <CodeIcon className="w-3.5 h-3.5" />
                            <span>Kod</span>
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {activeTab === 'code' && (
                        <button
                            onClick={handleCopy}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${copied ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'}`}
                        >
                            <CopyIcon className="w-3.5 h-3.5" />
                            <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
                        </button>
                    )}
                    <button
                        onClick={toggleFullscreen}
                        className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        title={isFullscreen ? 'Bağla' : 'Genişləndir'}
                    >
                        {isFullscreen ? <MinimizeIcon className="w-4 h-4" /> : <MaximizeIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div className="flex-grow relative overflow-hidden bg-white">
                {activeTab === 'preview' ? (
                    <iframe
                        ref={iframeRef}
                        title={title}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    />
                ) : (
                    <div className="w-full h-full bg-[#0d1117] overflow-auto custom-scrollbar p-4">
                        <pre className="text-[13px] font-mono leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all">
                            <code>{html}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};
