/**
 * ── COZYOS EDUCATION SUITE TEMPLATE ENCODING MODULE ──
 * VERSION: 1.0.0 (Production-Ready Architecture)
 * SERVICE DOMAIN: core/templates.js
 */

export default {
    /**
     * Builds a structured document frame injecting school identity parameters.
     */
    compile(templateType, dynamicData, schoolBranding = {}) {
        const defaults = {
            logo: "assets/default-logo.png",
            watermark: "assets/default-watermark.png",
            motto: "Elimu ni Mwanga",
            primaryColor: "#002B1B", // Premium Emerald Primary
            secondaryColor: "#C5A059", // Gold Secondary
            address: "P.O. Box 100, Kilifi",
            stamp: "assets/default-stamp.png"
        };

        const brand = { ...defaults, ...schoolBranding };
        const contentHtml = this._resolveTemplateContent(templateType, dynamicData);

        return `
            <div class="cozy-printable-document" style="font-family: 'Inter', sans-serif; position: relative; padding: 40px; color: #111; background: #fff; min-height: 297mm; box-sizing: border-box;">
                <!-- Subtle Security Watermark Graphic Layer -->
                <div class="cozy-watermark" style="position: absolute; top: 35%; left: 20%; width: 60%; height: 30%; opacity: 0.04; background: url('${brand.watermark}') no-repeat center; background-size: contain; pointer-events: none; transform: rotate(-30deg);"></div>
                
                <!-- School Structural Letterhead Header -->
                <div class="cozy-header" style="border-bottom: 3px double ${brand.primaryColor}; padding-bottom: 20px; margin-bottom: 30px; display: flex; align-items: center; justify-content: space-between;">
                    <img src="${brand.logo}" style="max-height: 80px; object-fit: contain;" />
                    <div style="text-align: right; flex-grow: 1; padding-left: 20px;">
                        <h1 style="margin: 0; color: ${brand.primaryColor}; font-size: 24px; text-transform: uppercase; font-weight: 800;">${brand.name || 'CozyOS Academy Framework'}</h1>
                        <p style="margin: 4px 0 0 0; font-style: italic; color: ${brand.secondaryColor}; font-size: 13px;">"${brand.motto}"</p>
                        <p style="margin: 4px 0 0 0; font-size: 11px; color: #555; line-height: 1.4;">${brand.address} | Email: ${brand.email} | Tel: ${brand.phone}</p>
                    </div>
                </div>

                <!-- Core Document Payload -->
                <div class="cozy-body-content" style="min-height: 180mm; font-size: 14px; line-height: 1.6;">
                    ${contentHtml}
                </div>

                <!-- Footer, Verification Signatures & QR Code Validation Block -->
                <div class="cozy-footer" style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #666;">
                    <div>
                        <p style="margin: 0;">Issued by: <strong>${brand.principalName || 'Principal Office'}</strong></p>
                        <p style="margin: 2px 0 0 0;">Board Chair: ${brand.boardChair || 'BOM Management'}</p>
                    </div>
                    <div style="text-align: center; position: relative;">
                        <img src="${brand.stamp}" style="max-height: 70px; opacity: 0.85; position: absolute; bottom: 10px; right: 20px; pointer-events: none;" />
                        <div style="border-top: 1px solid #333; width: 150px; margin-top: 40px; text-align: center;">Authorized Signature</div>
                    </div>
                    <div style="text-align: right;">
                        <div id="cozy-doc-qr" style="background: #eee; width: 65px; height: 65px; display: flex; align-items: center; justify-content: center; font-size: 8px; border: 1px solid #ccc; margin-left: auto; margin-bottom: 4px;">[QR VERIFY]</div>
                        <span style="font-size: 9px; color: #999;">Secure Document ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
                    </div>
                </div>
            </div>
        `;
    },

    _resolveTemplateContent(type, data) {
        switch (type.toLowerCase()) {
            case "admission_form":
                return `
                    <h2 style="text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 25px;">Official Admission Form</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr><td style="padding: 8px; border: 1px solid #ddd; width: 30%; font-weight: bold;">Student Full Name</td><td style="padding: 8px; border: 1px solid #ddd;">${data.studentName || '________________________'}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Admission Track Number</td><td style="padding: 8px; border: 1px solid #ddd;">${data.admNumber || 'PENDING ASSIGNMENT'}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Class / Grade Entry</td><td style="padding: 8px; border: 1px solid #ddd;">${data.grade || '________________________'}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Parent/Guardian Contact</td><td style="padding: 8px; border: 1px solid #ddd;">${data.parentName || '________________________'}</td></tr>
                    </table>
                    <p style="margin-top: 30px;">This file certifies that the above-listed candidate has been allocated a learning matrix track under the rules of the institution's board structure.</p>
                `;
            case "report_card":
                return `
                    <h2 style="text-align: center; text-transform: uppercase; margin-bottom: 25px;">Student Academic Performance Report</h2>
                    <div style="margin-bottom: 15px;"><strong>Student:</strong> ${data.studentName} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Term:</strong> Term 1 &nbsp;&nbsp;&nbsp;&nbsp; <strong>Grade:</strong> ${data.grade}</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="background: #f5f5f5;"><th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Subject Element</th><th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Score (%)</th><th style="border: 1px solid #ddd; padding: 10px; text-align: center;">Grade Assignment</th></tr></thead>
                        <tbody>
                            <tr><td style="border: 1px solid #ddd; padding: 8px;">Mathematics Matrix</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${data.mathScore || 82}</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">A</td></tr>
                            <tr><td style="border: 1px solid #ddd; padding: 8px;">Kiswahili na Fasihi</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${data.swaScore || 78}</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">A-</td></tr>
                            <tr><td style="border: 1px solid #ddd; padding: 8px;">English Language Core</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${data.engScore || 85}</td><td style="border: 1px solid #ddd; padding: 8px; text-align: center;">A</td></tr>
                        </tbody>
                    </table>
                    <p style="margin-top: 25px;"><strong>Class Teacher's Assessment Remarks:</strong> ${data.remarks || 'Excellent progress exhibited throughout the term execution tracks.'}</p>
                `;
            case "fee_statement":
                return `
                    <h2 style="text-align: center; text-transform: uppercase; margin-bottom: 25px;">Official Financial Ledger Account Statement</h2>
                    <div style="margin-bottom: 15px;"><strong>Account Name:</strong> ${data.studentName} &nbsp;&nbsp;&nbsp;&nbsp; <strong>Ref ID:</strong> ADM-${data.admNumber}</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="background: #f5f5f5;"><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Allocation Item Description</th><th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Amount (KES)</th></tr></thead>
                        <tbody>
                            <tr><td style="border: 1px solid #ddd; padding: 8px;">Tuition and Classroom Allocation Fee</td><td style="border: 1px solid #ddd; padding: 8px; text-align: right;">35,000.00</td></tr>
                            <tr><td style="border: 1px solid #ddd; padding: 8px;">Digital Learning Systems & CozyOS Operations</td><td style="border: 1px solid #ddd; padding: 8px; text-align: right;">4,500.00</td></tr>
                            <tr style="font-weight: bold; background: #fafafa;"><td style="border: 1px solid #ddd; padding: 8px;">Total Aggregated Ledger Balance Due</td><td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #b30000;">KES ${data.balance || '0.00'}</td></tr>
                        </tbody>
                    </table>
                `;
            default:
                return `<h2 style="text-align: center;">Official School Memorandum Document</h2><p>${JSON.stringify(data)}</p>`;
        }
    }
};
