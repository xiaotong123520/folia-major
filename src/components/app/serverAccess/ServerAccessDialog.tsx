import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Sheet from '../../shared/Sheet';
import { accessRequest, ServerAccessError } from '../../../services/serverAccess/client';
import { useServerAccessStore } from '../../../services/serverAccess/store';

// Email code entry for server playback, using the same modal frame on phone and desktop.
export default function ServerAccessDialog() {
    const { t } = useTranslation();
    const open = useServerAccessStore(state => state.open);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [challenge, setChallenge] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [seconds, setSeconds] = useState(0);
    const id = useId();
    useEffect(() => {
        if (!open || seconds <= 0) return;
        const timer = window.setTimeout(() => setSeconds(value => Math.max(0, value - 1)), 1000);
        return () => window.clearTimeout(timer);
    }, [open, seconds]);
    const close = () => { useServerAccessStore.getState().setOpen(false); };
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError('');
        try {
            if (challenge) {
                const session = await accessRequest<{ token: string; expiresAt: number }>('verify', { challenge, code });
                useServerAccessStore.getState().save(session);
                setCode(''); setChallenge(''); close();
            } else await sendCode();
        } catch (failure) {
            setError(failure instanceof ServerAccessError ? failure.code : 'unavailable');
        } finally { setBusy(false); }
    }
    async function sendCode() {
        const result = await accessRequest<{ challenge: string; retryAfter: number }>('request', { email });
        setChallenge(result.challenge); setCode(''); setSeconds(result.retryAfter);
    }
    async function resend() {
        if (busy || seconds > 0) return;
        setBusy(true); setError('');
        try { await sendCode(); }
        catch (failure) { setError(failure instanceof ServerAccessError ? failure.code : 'unavailable'); }
        finally { setBusy(false); }
    }
    const field = 'mt-2 min-h-12 w-full rounded-xl border border-[var(--st-line)] bg-[var(--st-fill)] px-3 text-base';
    const knownErrors = ['invalid_email', 'invalid_code', 'rate_limited', 'mail_unavailable', 'not_configured', 'storage_unavailable'];
    return <Sheet isOpen={open} onClose={close} closeDisabled={busy} title={t('serverAccess.title')} closeTip={t('serverAccess.close')} size="s">
        <form onSubmit={submit} className="space-y-4 p-1">
            <p className="text-sm leading-relaxed">{t('serverAccess.description')}</p>
            <label className="block text-sm" htmlFor={id + '-email'}>{t('serverAccess.email')}
                <input id={id + '-email'} className={field} type="email" autoComplete="email" required maxLength={254} disabled={busy}
                    value={email} onChange={event => { setEmail(event.target.value); setChallenge(''); setCode(''); setError(''); }} />
            </label>
            {challenge && <>
                <p role="status" className="text-sm">{t('serverAccess.sent')}</p>
                <label className="block text-sm" htmlFor={id + '-code'}>{t('serverAccess.code')}
                    <input id={id + '-code'} className={field} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy}
                        value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                </label>
                <button type="button" onClick={() => void resend()} disabled={busy || seconds > 0} className="min-h-11 text-sm underline disabled:opacity-50">
                    {seconds > 0 ? t('serverAccess.resendIn', { seconds }) : t('serverAccess.resend')}
                </button>
            </>}
            {error && <p role="alert" className="text-sm text-[var(--st-err)]">{t('serverAccess.errors.' + (knownErrors.includes(error) ? error : 'unavailable'))}</p>}
            <button type="submit" disabled={busy || (!challenge && seconds > 0)} className="min-h-12 w-full rounded-xl bg-violet-600 px-4 text-white disabled:opacity-50">
                {busy ? t('serverAccess.working') : t(challenge ? 'serverAccess.verify' : 'serverAccess.send')}
            </button>
            <p className="text-xs leading-relaxed opacity-70">{t('serverAccess.privacy')}</p>
        </form>
    </Sheet>;
}
