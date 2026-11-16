// Written against the 0.2.0 public API and never edited. If this stops compiling, an
// upgrade from 0.2 would break existing sites: keep the old API working instead.
import { DeferredTags, ConsentBanner, setConsent, getConsent, openConsentSettings, pushEvent, trackMetaEvent, loadTagsNow, tagsLoaded, DEFAULT_CONSENT_TEXT, type ConsentBannerText, type DeferredTagsProps, type ConsentSetting } from '../../src/index.js';

const hindi: ConsentBannerText = {
  title: 't', body: 'b', policy: 'p', acceptAll: 'a', rejectAll: 'r', choose: 'c', save: 's',
  necessary: 'n', necessaryDescription: 'nd', analytics: 'an', analyticsDescription: 'ad',
  marketing: 'm', marketingDescription: 'md', alwaysOn: 'o',
};
const props: DeferredTagsProps = { gtm: 'GTM-X', metaPixel: '1', linkedin: '2', consent: 'stored' };
const id: string = props.gtm as string;
const c: ConsentSetting = null;
export const A = () => (
  <>
    <DeferredTags {...props} delay={3000} onLoad={(r) => console.log(r)} />
    <ConsentBanner text={hindi} onChoice={(x, a) => console.log(x.id, a)} />
    <ConsentBanner text={{ ...DEFAULT_CONSENT_TEXT, title: 'x' }} />
  </>
);
setConsent({ analytics: true, marketing: false });
getConsent(); openConsentSettings(); pushEvent('x'); trackMetaEvent('Lead'); loadTagsNow(); tagsLoaded();
console.log(id, c);
