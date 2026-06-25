import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Effective: June 2026</p>

        <p>This internal scheduling application ("App") is operated for workforce management purposes. This policy explains how employee data is handled within the App.</p>

        <h2>Information We Collect</h2>
        <ul>
          <li><strong>Name</strong> — used to identify you in the schedule</li>
          <li><strong>PIN</strong> — used for authentication; visible to managers for account recovery only</li>
          <li><strong>Availability preferences</strong> — days and shift types you mark as unavailable</li>
          <li><strong>Schedule data</strong> — shifts assigned to you</li>
        </ul>

        <h2>How We Use It</h2>
        <p>All data is used exclusively for internal workforce scheduling. We do not sell, share, or transmit your information to any third party.</p>

        <h2>Data Storage</h2>
        <p>Data is stored on a secure server controlled by management. The App does not use third-party analytics, advertising, or tracking services.</p>

        <h2>Who Can See Your Data</h2>
        <p>Managers can view employee names, PINs (for recovery purposes), availability, and schedules. Other employees cannot view your personal information.</p>

        <h2>Your Rights</h2>
        <p>You may update your availability at any time within the App. To request removal of your data, speak with your manager.</p>

        <h2>No Payment Information</h2>
        <p>This App does not collect, process, or store any payment or financial information.</p>

        <h2>Limitation of Liability</h2>
        <p>This App is provided as an internal scheduling tool. The operator makes no warranties regarding uninterrupted availability. The operator is not liable for any indirect, incidental, or consequential damages arising from use of this App.</p>

        <h2>Contact</h2>
        <p>For privacy questions, contact management directly.</p>
      </div>
    </div>
  );
}
