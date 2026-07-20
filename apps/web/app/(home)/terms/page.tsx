import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalDocument, LegalSection } from '@/components/legal-document'
import { pageMetadataUrls } from '@/lib/shared'

const urls = pageMetadataUrls('/terms')

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The terms governing the ctxindex website and managed OAuth applications, alongside its open-source software license.',
  alternates: urls ? { canonical: urls.canonical } : undefined,
  openGraph: urls ? { url: urls.canonical } : undefined,
}

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      summary="These terms govern the ctxindex public website and managed OAuth applications. The command-line software remains governed by its open-source license."
      lastUpdated="July 19, 2026"
    >
      <LegalSection title="1. About ctxindex">
        <p>
          ctxindex is an independent, pre-release software project operated by
          Blaž Aristovnik, an individual based in Slovenia. It provides a local
          command-line interface for user-directed access to configured mail,
          calendar, filesystem, and Extension Sources. It is not Google,
          Microsoft, or an agent provider, and it is not endorsed by them.
        </p>
        <p>
          The ctxindex software is offered under the MIT License. That license
          governs use, copying, modification, and distribution of the software,
          and these terms do not reduce the rights it grants. In these terms,
          the “Services” are the public website and OAuth applications operated
          under the ctxindex name.
        </p>
        <p>
          Questions about these terms can be sent to{' '}
          <a className="ctx-inline-link" href="mailto:privacy@ctxindex.com">
            privacy@ctxindex.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Acceptance and authority">
        <p>
          By using the Services or authorizing a ctxindex OAuth application, you
          agree to these terms and the{' '}
          <Link className="ctx-inline-link" href="/privacy">
            Privacy Policy
          </Link>
          . Your use of the command-line software itself is governed separately
          by the MIT License. If you use the Services for an organization, you
          represent that you are authorized to connect the Accounts and Sources
          involved and to accept these terms on its behalf.
        </p>
        <p>
          Do not use the Services to access another person&apos;s data without
          lawful authority or in a way that violates applicable law, provider
          terms, or the rights of others.
        </p>
      </LegalSection>

      <LegalSection title="3. Your Accounts, providers, and consent">
        <p>
          You choose which Accounts and Sources to connect and which local
          agents or processes may invoke ctxindex. You are responsible for
          reviewing each OAuth consent screen, granting only permissions you
          understand, maintaining lawful access to connected data, and revoking
          access when it is no longer needed.
        </p>
        <p>
          Loaded Extensions may contribute additional permissions to an OAuth
          request through a selected available OAuth App. An OAuth App does not
          certify or endorse an Extension. The provider consent screen is the
          authoritative description of the permissions requested for a specific
          authorization, and you should review both the Extension and that
          screen before consenting.
        </p>
        <p>
          Your use of Google, Microsoft, and other providers remains subject to
          their terms, privacy policies, administrator rules, quotas, and
          availability. A provider or organization administrator may deny or
          revoke access at any time.
        </p>
      </LegalSection>

      <LegalSection title="4. Local data and security responsibilities">
        <p>
          ctxindex stores configuration, indexes, caches, logs, and credentials
          on the device where you run it. You are responsible for securing that
          device, its operating-system account, backups, OAuth client
          credentials, secret-store keys, exported data, and any software that
          can execute ctxindex commands.
        </p>
        <p>
          You are also responsible for choosing appropriate Realm and Source
          boundaries and for checking command output before acting on it. Do not
          expose ctxindex to an untrusted agent, Extension, script, user, or
          network service.
        </p>
        <p>
          Extensions are trusted executable code loaded in the ctxindex process
          and may use its local file, environment, network, and data-access
          permissions. Agents and other processes receiving command output may
          transmit it under their own privacy and security practices. Review
          those tools before granting access.
        </p>
      </LegalSection>

      <LegalSection title="5. Provider Actions">
        <p>
          At the date of these terms, official ctxindex Extensions expose
          reversible email Draft creation and update through an explicitly
          selected mailbox Source but no email-send Action. Future official
          releases may expose other Actions, including sending, only after the
          product contract and applicable notices change. Third-party Extensions
          may independently expose other Actions and request additional
          permissions. Review every Action, recipient, permission, and provider
          state before invoking it.
        </p>
        <p>
          Provider requests can fail, time out, be rate limited, or complete
          ambiguously. Verify important results directly with the canonical
          provider before relying on them.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>You must not use the Services to:</p>
        <ul>
          <li>
            break laws or infringe privacy, confidentiality, or other rights;
          </li>
          <li>
            bypass provider consent, administrator controls, security measures,
            rate limits, or access restrictions;
          </li>
          <li>
            distribute malware, steal credentials, perform unauthorized
            surveillance, spam, or facilitate fraud or abuse; or
          </li>
          <li>
            misrepresent your identity, the project, or your authority to use
            connected data.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Changes, suspension, and availability">
        <p>
          The Services are pre-release and their features, permissions,
          interfaces, compatibility, and these terms may change. Blaž Aristovnik
          may limit or discontinue a managed OAuth application or website
          feature when reasonably necessary for security, legal compliance,
          provider-policy compliance, maintenance, or project viability.
        </p>
        <p>
          Material changes to these terms will be published here with a new
          last-updated date. Continued use after the updated terms take effect
          constitutes acceptance to the extent permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="8. No warranties">
        <p>
          To the maximum extent permitted by law, the Services are provided “as
          is” and “as available,” without warranties of uninterrupted operation,
          fitness for a particular purpose, data accuracy, non-infringement, or
          compatibility with any provider or agent. The MIT License contains the
          warranty terms for the software. Nothing in these terms excludes a
          warranty or consumer right that cannot lawfully be excluded.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Blaž Aristovnik will not be
          liable for indirect, incidental, special, consequential, or punitive
          loss arising from use of the Services, including loss of data,
          credentials, access, business, or profits. This limitation does not
          apply where liability cannot legally be limited, including liability
          for intentional misconduct or other mandatory protections.
        </p>
      </LegalSection>

      <LegalSection title="10. Governing law and contact">
        <p>
          These terms are governed by the laws of Slovenia and applicable
          European Union law, without depriving consumers of mandatory
          protections available in their country of residence. Courts with
          jurisdiction under applicable law may hear disputes.
        </p>
        <p>
          Before filing a formal claim, please contact{' '}
          <a className="ctx-inline-link" href="mailto:privacy@ctxindex.com">
            privacy@ctxindex.com
          </a>{' '}
          so there is an opportunity to resolve the issue informally.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
