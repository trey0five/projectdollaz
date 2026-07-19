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
        We host the Service on <strong>Amazon Web Services (AWS)</strong> in the United States and use a limited set of
        vendors for functions such as transactional email and payment processing. These providers are bound to protect
        the information and to use it only to perform their services.
      </P>

      <H2>8. Your choices &amp; requests</H2>
      <P>
        Parents and eligible students should direct FERPA access, review, and amendment requests to their school, which
        controls the records; KYRO will assist the school in responding. Customer administrators can manage users and
        request data export or deletion at any time.
      </P>

      <H2>9. Changes</H2>
      <P>
        We may update this Policy; material changes will be communicated through the Service or by email. Continued use
        after the effective date constitutes acceptance.
      </P>

      <H2>10. Contact</H2>
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
