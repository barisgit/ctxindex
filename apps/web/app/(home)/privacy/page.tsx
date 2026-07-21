import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, LegalSection } from '@/components/legal-document'
import { pageMetadataUrls } from '@/lib/shared'

const urls = pageMetadataUrls('/privacy')

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How ctxindex accesses, uses, stores, and shares data when you connect Google, Microsoft, and local sources.',
  alternates: urls ? { canonical: urls.canonical } : undefined,
  openGraph: urls ? { url: urls.canonical } : undefined,
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      summary="This policy explains how ctxindex handles data in its local command-line software, public website, and managed Google and Microsoft OAuth applications."
      lastUpdated="July 19, 2026"
    >
      <LegalSection title="1. Who this policy covers">
        <p>
          ctxindex is an independent software project operated by Blaž
          Aristovnik, an individual based in Slovenia. Blaž Aristovnik is the
          controller for personal data he receives and processes in connection
          with the public website, managed OAuth application administration, and
          support or privacy requests. This policy applies when you use the
          ctxindex command-line software, visit ctxindex.com, or authorize an
          OAuth application published under the ctxindex name.
        </p>
        <p>
          Questions or privacy requests can be sent to{' '}
          <a className="ctx-inline-link" href="mailto:privacy@ctxindex.com">
            privacy@ctxindex.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. The local-first boundary">
        <p>
          ctxindex is locally run software. It does not operate a hosted inbox,
          calendar, synchronization service, or user-account database. During
          normal use, OAuth tokens and provider content move directly between
          your device and the provider API. They are not routed through a
          ctxindex-operated server.
        </p>
        <p>
          The public website is separate from the CLI and does not receive your
          connected mailbox, calendar, OAuth token, local index, or command
          output.
        </p>
      </LegalSection>

      <LegalSection title="3. Data the software accesses">
        <p>
          Depending on the Sources you configure and the Extensions and
          capabilities you load, ctxindex may access and process:
        </p>
        <ul>
          <li>
            account identity, such as a provider user identifier, verified email
            address or principal name, and a label you choose;
          </li>
          <li>
            mail data, including message and thread identifiers, senders,
            recipients, subject lines, message bodies, timestamps, labels, draft
            content, and attachments you retrieve;
          </li>
          <li>
            calendar data, including calendar identifiers, event titles,
            descriptions, times, locations, attendees, recurrence, and status;
          </li>
          <li>
            OAuth authorization data, including granted scopes, access and
            refresh tokens, token expiry information, and OAuth App credentials;
            and
          </li>
          <li>
            local configuration and operational data, including Realms, Sources,
            stable references, indexes, caches, synchronization cursors, logs,
            warnings, and errors.
          </li>
        </ul>
        <p>
          ctxindex only accesses a provider after you start its OAuth consent
          flow and approve the permissions shown by that provider. Loaded
          Extensions contribute the permissions they require, so the provider
          consent screen is the authoritative description of the permissions
          requested in a particular authorization.
        </p>
      </LegalSection>

      <LegalSection title="4. Why the software uses that data">
        <p>
          ctxindex uses the data above only to provide user-directed features:
        </p>
        <ul>
          <li>identify and maintain the provider Accounts you connect;</li>
          <li>
            synchronize selected Sources into a local index for search and
            offline access within the coverage you configure;
          </li>
          <li>
            search, retrieve, relate, and export mail, calendar events, files,
            and other configured Resources;
          </li>
          <li>run provider Actions that you explicitly invoke; and</li>
          <li>
            refresh authorization, enforce provider boundaries, diagnose
            failures, and protect the integrity of local state.
          </li>
        </ul>
        <p>
          At the date of this policy, the official ctxindex Extensions expose
          reversible email Draft creation and update but no email-send Action.
          If the product contract and disclosures change, a future official
          release may add other Actions. Third-party Extensions may
          independently expose other Actions and request the corresponding
          provider permissions. Such capabilities require an explicit command
          and provider authorization; review an Extension and its requested
          permissions before using it.
        </p>
      </LegalSection>

      <LegalSection title="5. Google user data">
        <p>
          The official Google Extensions currently request{' '}
          <code>gmail.readonly</code> to read Gmail messages,{' '}
          <code>gmail.compose</code> to create and update Gmail Drafts, and{' '}
          <code>calendar.events.readonly</code> to read Google Calendar events,
          together with identity and durable-authorization access. Google&apos;s{' '}
          <code>gmail.compose</code> scope technically permits sending mail, but
          the current official Google Extension uses it only for Draft creation
          and update and does not invoke Gmail send endpoints.
        </p>
        <p>
          Loaded Extensions may contribute additional Google scopes through an
          available OAuth App. Google may require separate verification, display
          warnings, limit access, or reject an authorization for such scopes.
          The exact scopes are displayed in Google&apos;s consent screen.
        </p>
        <p>
          The use of information received from Google Workspace scopes will
          adhere to the{' '}
          <a
            className="ctx-inline-link"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          Blaž Aristovnik does not sell Google user data, use it for
          advertising, transfer it to data brokers, or use it to train or
          improve a general-purpose AI or machine-learning model. Data held only
          in your local installation is not accessible to the operator unless
          you deliberately provide it for support or another request. Data you
          provide is used only to handle that request and is deleted when no
          longer reasonably needed for it, subject to legal obligations.
        </p>
      </LegalSection>

      <LegalSection title="6. Microsoft user data">
        <p>
          When enabled, ctxindex uses delegated Microsoft Graph permissions on
          behalf of the signed-in user. The official Microsoft Extensions
          currently use <code>User.Read</code> to identify the account,{' '}
          <code>Mail.ReadWrite</code> to read mail and create or update Drafts,
          and <code>Calendars.Read</code> to read calendar events. OpenID
          Connect scopes support sign-in and durable authorization. Loaded
          Extensions may contribute additional delegated permissions through the
          same selected OAuth App, including permissions requested dynamically
          at authorization time. The Microsoft consent screen is the
          authoritative description of each request. The ctxindex-managed
          Microsoft application uses delegated permissions, not application
          permissions that run without a signed-in user.
        </p>
      </LegalSection>

      <LegalSection title="7. Local storage and security">
        <p>
          Provider content, normalized Resources, indexes, configuration,
          caches, and logs are stored on your device in ctxindex&apos;s local
          application directories. OAuth tokens and other secrets are stored
          outside SQLite in the operating-system keychain when available or in
          an encrypted-file backend that may be selected automatically during
          initialization or explicitly later. SQLite and configuration store
          typed secret references rather than raw secret values.
        </p>
        <p>
          The host-provided authorized provider-request path restricts requests
          to declared provider hosts, and ctxindex redacts secrets from normal
          command output, diagnostics, and logs. No security measure is perfect;
          you remain responsible for securing your device, local files,
          secret-store keys, and the agents or other processes you allow to
          invoke ctxindex.
        </p>
      </LegalSection>

      <LegalSection title="8. Sharing and third parties">
        <p>
          ctxindex does not sell provider data or share it with advertisers.
          Provider data is disclosed to provider endpoints, Extensions, local
          commands, agents, scripts, or other processes only as required by the
          configuration and workflows you choose.
        </p>
        <p>
          Extensions are trusted executable code loaded in the ctxindex process.
          They can use the local process&apos;s permissions to access files,
          environment values, network services, and data returned through
          ctxindex, and may transmit that data. An OAuth App identifies the
          OAuth application used for authorization; it does not certify or
          endorse an Extension that uses it. Review an Extension&apos;s source,
          documentation, permissions, and operator before loading it.
        </p>
        <p>
          If you permit a coding agent, personal agent, script, Extension, or
          other process to invoke ctxindex, that process can receive the data
          returned by the commands it runs. You choose those tools, permissions,
          and workflows. Their privacy and security practices are outside the
          control of ctxindex.
        </p>
        <p>
          Google and Microsoft process authorization and provider data under
          their own terms and privacy policies. The public website is hosted by{' '}
          <a
            className="ctx-inline-link"
            href="https://vercel.com/legal/privacy-notice"
          >
            Vercel
          </a>
          , which may process IP addresses, approximate location, browser and
          device details, requested URLs, documentation-search queries, errors,
          and timestamps to deliver, secure, and operate the site. Blaž
          Aristovnik processes this information on the basis of legitimate
          interests in providing, securing, and diagnosing the website, and
          processes support or privacy correspondence to respond to requests and
          meet legal obligations.
        </p>
        <p>
          The operator does not intentionally create a separate long-term copy
          of routine website request logs. Vercel retains service data according
          to the applicable hosting plan and its policies and may process it
          outside the European Economic Area using the safeguards described in
          its privacy notice and, where applicable, its{' '}
          <a className="ctx-inline-link" href="https://vercel.com/legal/dpa">
            Data Processing Addendum
          </a>
          . Information may be retained longer when reasonably necessary for
          security incidents, legal obligations, or legal claims. The site does
          not intentionally use advertising trackers or analytics cookies.
        </p>
      </LegalSection>

      <LegalSection title="9. Retention, deletion, and revocation">
        <p>
          Local provider data remains on your device until you remove it. A
          Source&apos;s provider remains canonical, but revoking OAuth access
          does not automatically erase local indexes, caches, exports, or copies
          you supplied to another local process.
        </p>
        <p>
          Use <code>ctxindex source remove &lt;label-or-id&gt;</code> to remove
          one Source and its locally stored Resources,{' '}
          <code>ctxindex account remove &lt;label&gt;</code> to remove an
          Account and request deletion of its stored Grant secrets,{' '}
          <code>ctxindex oauth-app remove &lt;provider&gt; &lt;label&gt;</code>{' '}
          to remove local OAuth App metadata and request deletion of its stored
          configuration, and <code>ctxindex artifact purge</code> to remove
          managed Artifact-cache bytes. You can also revoke ctxindex in your
          Google Account or Microsoft account security settings.
        </p>
        <p>
          To delete remaining directory-backed ctxindex state, remove the
          applicable ctxindex configuration, data, state, and cache directories
          and any exports you created. Secrets stored in an operating-system
          keychain are outside those directories. Verify and remove remaining
          ctxindex entries with the operating system&apos;s secret manager,
          particularly if the keychain refuses a cleanup request. Back up
          anything you want to keep first. These actions do not delete canonical
          data held by a provider.
        </p>
        <p>
          Because provider content is not stored on a ctxindex-operated server,
          Blaž Aristovnik generally cannot inspect, export, correct, or delete
          the copy on your device for you. For website request data or another
          privacy request, contact the address above.
        </p>
      </LegalSection>

      <LegalSection title="10. Legal rights and changes">
        <p>
          Depending on where you live, you may have rights concerning personal
          data processed by Blaž Aristovnik, including access, correction,
          deletion, restriction, objection, portability, and a right to complain
          to a supervisory authority. In Slovenia, the supervisory authority is
          the{' '}
          <a className="ctx-inline-link" href="https://www.ip-rs.si/en/">
            Information Commissioner of the Republic of Slovenia
          </a>
          . These rights do not replace the controls you have over data held
          solely on your own device or by Google, Microsoft, or another
          provider.
        </p>
        <p>
          This policy may change as ctxindex evolves. Material changes will be
          published here with a new last-updated date. If a change permits a new
          use of Google user data, affected users will be notified and asked to
          consent before that new use begins.
        </p>
        <p>
          See the{' '}
          <Link className="ctx-inline-link" href="/terms">
            Terms of Service
          </Link>{' '}
          for the conditions governing use of ctxindex.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
