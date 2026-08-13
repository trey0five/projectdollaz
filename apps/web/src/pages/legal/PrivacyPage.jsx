// Privacy Policy — public page (/privacy). Also the destination of the homepage
// "FERPA-compliant" trust badge, so it explains the FERPA posture honestly.
import LegalPage, { H2, P, UL } from './LegalPage.jsx'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 19, 2026">
      <P>
        This Privacy Policy explains how KYRO (&ldquo;KYRO,&rdquo; &ldquo;we&rdquo;) collects, uses, and protects
        information in connection with the KYRO platform (the &ldquo;Service&rdquo;). KYRO provides the Service to
        schools and organizations (&ldquo;Customers&rdquo;); when we process Customer data, we do so on the
        Customer&rsquo;s behalf and under its direction.
      </P>

      <H2>1. Information we process</H2>
      <UL>
        <li><strong>Account information</strong> — names, work email, and role of the users a Customer invites.</li>
        <li>
          <strong>Customer Data</strong> — the school&rsquo;s financial and operational data (trial balances,
          statements, budgets, enrollment counts, aggregate demographics) and any documents a Customer uploads.
        </li>
        <li><strong>Usage &amp; security logs</strong> — sign-ins, actions, and audit events used to secure the Service.</li>
      </UL>
      <P>
        KYRO is <strong>aggregate by design</strong>: it is not a student information system and does not require
        student-level records. Enrollment and demographic figures are stored as aggregate counts, not individual
        student rows.
      </P>

      <H2>2. How we use information</H2>
      <P>
        We use information solely to provide, secure, support, and improve the Service for the Customer. We do
        <strong> not</strong> sell personal information, and we do <strong>not</strong> use Customer Data to train
        third-party AI models or for advertising.
      </P>

      <H2>3. FERPA &amp; student education records</H2>
      <P>
        Where Customer Data includes student education records, KYRO acts as a <strong>&ldquo;school official&rdquo;</strong>{' '}
        with a legitimate educational interest under the Family Educational Rights and Privacy Act (FERPA), under the
        Customer&rsquo;s direct control, using such records only to provide the Service and never re-disclosing them
        except as permitted or directed.
      </P>
      <P>
        FERPA is a <strong>shared responsibility</strong>: the school is the covered entity and owner of its records,
        while KYRO provides the technical and organizational safeguards below. Full detail is in our{' '}
        <strong>FERPA Compliance Overview</strong> (available from KYRO on request).
      </P>

      <H2>4. How we protect information</H2>
      <UL>
        <li><strong>Encryption in transit</strong> — TLS end-to-end, from the browser through every internal hop to the database.</li>
        <li><strong>Encryption at rest</strong> — databases, document storage, and secrets are encrypted with managed keys.</li>
        <li><strong>Tenant isolation</strong> — every request is scoped to the Customer; cross-tenant access is denied.</li>
        <li><strong>Least-privilege access &amp; audit logging</strong> — administrative and application access is separated and logged.</li>
        <li><strong>Private network &amp; firewall</strong> — the application runs in a private network behind a web application firewall; the database is not internet-accessible.</li>
      </UL>

      <H2>5. Artificial intelligence</H2>
      <P>
        The Penny assistant and AI insights run on models hosted <strong>within KYRO&rsquo;s own cloud account</strong>;
        data is not sent to a third-party AI provider and is not used for model training. A redaction layer removes
        personal identifiers before content reaches the model and restores them only for the authenticated user.
      </P>

      <H2>6. Data retention &amp; deletion</H2>
      <P>
        We retain Customer Data for as long as the Customer uses the Service, subject to configurable retention
        periods. A Customer may request export or deletion of its data; account-, school-, and organization-level
        deletion removes the associated records and purges related documents from storage, recorded in the audit log.
      </P>

      <H2>7. Service providers (sub-processors)</H2>
      <P>
        We host the Service on <strong>Amazon Web Services (AWS)</strong> in the United States. The full list of
        sub-processors is below. Each is bound to protect the information and to use it only to perform its service for
        us, and each is subject to the same restrictions we accept: no sale of Customer Data, and no use of it to train
        AI models. We will give notice before adding a sub-processor that processes Customer Data.
      </P>
      <UL>
        <li>
          <strong>Amazon Web Services</strong> (United States) &mdash; hosting, database, document storage, encryption
          keys. Processes all categories of Customer Data.
        </li>
        <li>
          <strong>Anthropic</strong> (United States) &mdash; the language model behind Penny and written insights.
          Personal identifiers are replaced with placeholder tokens before anything leaves our systems and restored in
          the response, so student and staff names are not transmitted. Anthropic does not train on data submitted
          through its API.
        </li>
        <li>
          <strong>OpenRouter</strong> (United States) &mdash; routes model requests to the provider above. It carries
          the same tokenized content and retains no prompt content for training.
        </li>
        <li>
          <strong>Intuit (QuickBooks)</strong> (United States) &mdash; accounting sync, at the school&rsquo;s election
          and only for schools that connect it. Financial data only; no student records.
        </li>
        <li>
          <strong>Stripe</strong> (United States) &mdash; subscription billing. Billing contact and payment details
          only; no school data.
        </li>
        <li>
          <strong>Brevo</strong> (European Union) &mdash; transactional email such as invitations, alerts and scheduled
          reports. Recipient addresses and message contents only.
        </li>
        <li>
          <strong>ElevenLabs</strong> (United States) &mdash; spoken narration, only when a user plays audio. Receives
          narration text, which is aggregate and carries no student identifiers.
        </li>
      </UL>

      <H2>8. Getting your data, and leaving</H2>
      <P>
        Your school owns its data. An owner can export a complete copy at any time from Settings &rarr; Your Data
        &mdash; every module, as spreadsheets, with no request to us and no involvement from us. The archive excludes
        connection credentials such as QuickBooks or SIS tokens, which are keys to other systems rather than
        information about your school. Because a full export is a complete copy leaving the platform, every other owner
        at the school is notified when one is requested, and both the request and the download are recorded in the
        audit log.
      </P>
      <P>
        On termination, Customer Data remains available for export for <strong>thirty days</strong>. After that period,
        or earlier on written request, we delete it from production systems, and it ages out of encrypted backups
        within the backup retention window. We will confirm deletion in writing on request. If we ever cease operating,
        the export above is deliberately built so that retrieving your data does not depend on us being available to
        help.
      </P>

      <H2>9. Your choices &amp; requests</H2>
      <P>
        Parents and eligible students should direct FERPA access, review, and amendment requests to their school, which
        controls the records; KYRO will assist the school in responding. Customer administrators can manage users and
        request data export or deletion at any time.
      </P>

      <H2>10. Changes</H2>
      <P>
        We may update this Policy; material changes will be communicated through the Service or by email. Continued use
        after the effective date constitutes acceptance.
      </P>

      <H2>11. Contact</H2>
      <P>
        Privacy questions or data requests: <a className="font-semibold text-gold underline" href="mailto:support@ourkyro.com">support@ourkyro.com</a>.
      </P>

      <P>
        <em className="text-muted">
          This page is a general template and does not constitute legal advice. KYRO recommends review by qualified
          counsel before relying on it.
        </em>
      </P>
    </LegalPage>
  )
}
