/**
 * ── COZYOS SCANNING HARDWARE CAPTURE MODULE ──
 * FILE: core/business/qrScanner.js
 */

export default {
    /**
     * CONSUME INBOUND SCANNED INPUT DATA
     */
    processHardwarePayload(rawScannedStringData, contextModelTarget) {
        if (!rawScannedStringData) return null;

        // Pattern 1: Safaricom Till/Lipa na M-Pesa QR Structure String Parsing Matches
        if (rawScannedStringData.startsWith("MPESA|BUYGOODS|")) {
            const [, tillNumber, businessName] = rawScannedStringData.split("|");
            return { type: "QR_PAYMENT", target: tillNumber, merchant: businessName, parsedAction: "POPULATE_CASHIER_CHECKOUT" };
        }

        // Pattern 2: Global EAN Standard Product Universal Barcodes
        if (/^\d{13}$/.test(rawScannedStringData) || /^\d{8}$/.test(rawScannedStringData)) {
            return { type: "BARCODE_PRODUCT", sku: rawScannedStringData, parsedAction: "INCREMENT_CART_QUANTITY" };
        }

        // Pattern 3: Government Issued IPRS National ID Validation String Formats
        if (rawScannedStringData.includes("ID_NO") || rawScannedStringData.startsWith("KE_ID")) {
            const extractions = rawScannedStringData.split(";");
            return { type: "NATIONAL_ID", idNumber: extractions[1], legalName: extractions[2], parsedAction: "AUTO_FILL_CUSTOMER_REGISTRATION" };
        }

        // Default Fallback: Simple text parsing
        return { type: "UNKNOWN_GENERIC_RAW", value: rawScannedStringData };
    }
};
