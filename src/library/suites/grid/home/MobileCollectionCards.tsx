import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disc3, Loader2 } from 'lucide-react';
import { getGrid3DSliderDisplayName, getGrid3DSliderSecondaryText, type Grid3DSliderItem } from './Grid3DSlider';
import { getSizedCoverUrl } from '../../../../utils/coverUrl';

type Props = {
    items: Grid3DSliderItem[];
    onSelect: (item: Grid3DSliderItem, index: number) => void;
    isLoading: boolean;
    isInteractive: boolean;
    emptyMessage?: string;
};

/** Touch browsing over the same visible collection list and selection callback as desktop. */
export default function MobileCollectionCards({ items, onSelect, isLoading, isInteractive, emptyMessage }: Props) {
    const { t } = useTranslation();
    const [limit, setLimit] = useState(40);
    return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4">
        {isLoading && <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm opacity-65"><Loader2 size={18} className="animate-spin"/>{t('playlist.loading')}</p>}
        {!isLoading && items.length === 0 && <p role="status" className="py-10 text-center text-sm opacity-60">{emptyMessage}</p>}
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {items.slice(0, limit).map((item, index) => <button key={`${item.type ?? ''}:${item.id}`} type="button"
                disabled={!isInteractive} onClick={() => onSelect(item, index)}
                className="min-w-0 rounded-2xl p-1 text-left disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet-300">
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-500/15">
                    {item.coverUrl ? <img src={getSizedCoverUrl(item.coverUrl, 320)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"/> : <Disc3 size={42} className="opacity-45"/>}
                </span>
                <span className="mt-2 block truncate text-sm font-semibold">{getGrid3DSliderDisplayName(item)}</span>
                <span className="mt-1 block truncate text-xs opacity-55">{getGrid3DSliderSecondaryText(item)}</span>
            </button>)}
        </div>
        {limit < items.length && <button type="button" onClick={() => setLimit(value => value + 40)} className="mt-5 min-h-12 w-full rounded-xl border border-current/15 text-sm">{t('playlist.loadMore')}</button>}
    </div>;
}
