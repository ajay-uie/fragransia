const admin = require("firebase-admin")

const taxInvoiceLogic = {
  // Generate tax invoice
  async generateTaxInvoice(orderId) {
    try {
      const db = admin.firestore()

      // Get order details
      const orderDoc = await db.collection("orders").doc(orderId).get()
      if (!orderDoc.exists) {
        return {
          success: false,
          error: "Order not found",
        }
      }

      const order = orderDoc.data()

      // Check if invoice already exists
      const existingInvoiceQuery = await db.collection("tax_invoices").where("orderId", "==", orderId).limit(1).get()

      if (!existingInvoiceQuery.empty) {
        const existingInvoice = existingInvoiceQuery.docs[0].data()
        return {
          success: true,
          invoice: {
            ...existingInvoice,
            generatedAt: existingInvoice.generatedAt?.toDate()?.toISOString(),
          },
        }
      }

      // Generate invoice number
      const invoiceNumber = this.generateInvoiceNumber()

      // Get company details
      const companyDetails = this.getCompanyDetails()

      // Calculate tax breakdown
      const taxBreakdown = this.calculateTaxBreakdown(order)

      // Prepare invoice data
      const invoiceData = {
        invoiceNumber,
        orderId,
        orderNumber: order.orderId,
        invoiceDate: admin.firestore.FieldValue.serverTimestamp(),
        dueDate: admin.firestore.FieldValue.serverTimestamp(), // Immediate for prepaid orders

        // Company details
        company: companyDetails,

        // Customer details
        customer: {
          name: `${order.userDetails.firstName} ${order.userDetails.lastName}`,
          email: order.userDetails.email,
          phone: order.userDetails.phoneNumber,
          billingAddress: order.shippingAddress, // Use shipping as billing if not provided
          gstNumber: order.userDetails.gstNumber || null,
        },

        // Order items with tax details
        items: order.items.map((item) => ({
          ...item,
          hsnCode: this.getHSNCode(item.productId),
          taxRate: 18, // 18% GST for cosmetics/perfumes
          taxAmount: Math.round(item.subtotal * 0.18 * 100) / 100,
          totalWithTax: Math.round(item.subtotal * 1.18 * 100) / 100,
        })),

        // Financial breakdown
        amounts: {
          subtotal: order.pricing.subtotal,
          discount: order.pricing.discount || 0,
          shippingCharges: order.pricing.shippingCharges || 0,
          giftWrapCharges: order.pricing.giftWrapCharge || 0,
          taxableAmount: order.pricing.subtotal - (order.pricing.discount || 0),
          ...taxBreakdown,
          grandTotal: order.pricing.total,
        },

        // Payment details
        payment: {
          method: order.paymentDetails?.method || "online",
          status: order.paymentStatus,
          transactionId: order.paymentDetails?.razorpayPaymentId || null,
          paidAmount: order.pricing.total,
          pendingAmount: 0,
        },

        // Additional details
        notes: this.generateInvoiceNotes(order),
        terms: this.getTermsAndConditions(),

        // Status
        status: "generated",
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        generatedBy: "system",
      }

      // Save invoice
      await db.collection("tax_invoices").doc(invoiceNumber).set(invoiceData)

      // Update order with invoice reference
      await db.collection("orders").doc(orderId).update({
        invoiceNumber,
        invoiceGenerated: true,
        invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      return {
        success: true,
        invoice: {
          ...invoiceData,
          invoiceDate: new Date().toISOString(),
          dueDate: new Date().toISOString(),
          generatedAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      console.error("Generate tax invoice error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  },

  // Get invoice by number
  async getInvoice(invoiceNumber) {
    try {
      const db = admin.firestore()

      const invoiceDoc = await db.collection("tax_invoices").doc(invoiceNumber).get()
      if (!invoiceDoc.exists) {
        return {
          success: false,
          error: "Invoice not found",
        }
      }

      const invoice = invoiceDoc.data()

      return {
        success: true,
        invoice: {
          ...invoice,
          invoiceDate: invoice.invoiceDate?.toDate()?.toISOString(),
          dueDate: invoice.dueDate?.toDate()?.toISOString(),
          generatedAt: invoice.generatedAt?.toDate()?.toISOString(),
        },
      }
    } catch (error) {
      console.error("Get invoice error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  },

  // Generate invoice number
  generateInvoiceNumber() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const timestamp = Date.now().toString().slice(-6)

    return `FRAG-${year}${month}-${timestamp}`
  },

  // Get company details
  getCompanyDetails() {
    return {
      name: "Fragransia",
      address: {
        line1: "Your Company Address Line 1",
        line2: "Your Company Address Line 2",
        city: "Your City",
        state: "Your State",
        pincode: "Your Pincode",
        country: "India",
      },
      gstNumber: "19CCLPG6874M1ZQ",
      panNumber: "CCLPG6874M",
      email: "orders@fragransia.com",
      phone: "+91-XXXXXXXXXX",
      website: "https://fragransia.com",
    }
  },

  // Calculate tax breakdown
  calculateTaxBreakdown(order) {
    const taxableAmount = order.pricing.subtotal - (order.pricing.discount || 0)
    const shippingTaxable = order.pricing.shippingCharges || 0
    const giftWrapTaxable = order.pricing.giftWrapCharge || 0

    const totalTaxableAmount = taxableAmount + shippingTaxable + giftWrapTaxable

    // For interstate: IGST 18%
    // For intrastate: CGST 9% + SGST 9%
    const isIntrastate = this.isIntrastateTransaction(order.shippingAddress.state)

    let cgst = 0,
      sgst = 0,
      igst = 0

    if (isIntrastate) {
      cgst = Math.round(totalTaxableAmount * 0.09 * 100) / 100
      sgst = Math.round(totalTaxableAmount * 0.09 * 100) / 100
    } else {
      igst = Math.round(totalTaxableAmount * 0.18 * 100) / 100
    }

    return {
      taxableAmount: totalTaxableAmount,
      cgst,
      sgst,
      igst,
      totalTax: cgst + sgst + igst,
      taxRate: 18,
    }
  },

  // Check if transaction is intrastate
  isIntrastateTransaction(customerState) {
    const companyState = "Your State" // Replace with actual company state
    return customerState === companyState
  },

  // Get HSN code for product
  getHSNCode(productId) {
    // HSN codes for cosmetics and perfumes
    // This should ideally be stored in product data
    return "3303" // HSN code for perfumes and toilet waters
  },

  // Generate invoice notes
  generateInvoiceNotes(order) {
    const notes = []

    if (order.couponCode) {
      notes.push(`Coupon Applied: ${order.couponCode}`)
    }

    if (order.giftWrap) {
      notes.push("Gift wrapping included")
    }

    notes.push("This is a computer generated invoice")

    return notes
  },

  // Get terms and conditions
  getTermsAndConditions() {
    return [
      "Goods once sold will not be taken back or exchanged",
      "Subject to jurisdiction",
      "E. & O.E.",
      "This invoice is digitally signed and does not require physical signature",
    ]
  },

  // Generate invoice HTML for printing/PDF
  generateInvoiceHTML(invoiceData) {
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
      }).format(amount)
    }

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString("en-IN")
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Tax Invoice - ${invoiceData.invoiceNumber}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .invoice-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .company-details { margin-bottom: 20px; }
            .invoice-details { display: flex; justify-content: space-between; margin: 20px 0; }
            .customer-details { margin: 20px 0; }
            .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .items-table th { background-color: #f2f2f2; }
            .totals-section { margin: 20px 0; float: right; width: 300px; }
            .totals-table { width: 100%; border-collapse: collapse; }
            .totals-table td { border: 1px solid #ddd; padding: 8px; }
            .grand-total { font-weight: bold; background-color: #f2f2f2; }
            .footer { margin-top: 40px; font-size: 12px; }
            .clear { clear: both; }
        </style>
    </head>
    <body>
        <div class="invoice-header">
            <h1>TAX INVOICE</h1>
            <h2>${invoiceData.company.name}</h2>
            <p>GST No: ${invoiceData.company.gstNumber}</p>
        </div>

        <div class="company-details">
            <h3>From:</h3>
            <p><strong>${invoiceData.company.name}</strong></p>
            <p>${invoiceData.company.address.line1}</p>
            <p>${invoiceData.company.address.line2}</p>
            <p>${invoiceData.company.address.city}, ${invoiceData.company.address.state} - ${invoiceData.company.address.pincode}</p>
            <p>Email: ${invoiceData.company.email}</p>
            <p>Phone: ${invoiceData.company.phone}</p>
        </div>

        <div class="invoice-details">
            <div>
                <p><strong>Invoice No:</strong> ${invoiceData.invoiceNumber}</p>
                <p><strong>Order No:</strong> ${invoiceData.orderNumber}</p>
                <p><strong>Invoice Date:</strong> ${formatDate(invoiceData.invoiceDate)}</p>
            </div>
            <div>
                <h3>Bill To:</h3>
                <p><strong>${invoiceData.customer.name}</strong></p>
                <p>${invoiceData.customer.billingAddress.address}</p>
                <p>${invoiceData.customer.billingAddress.city}, ${invoiceData.customer.billingAddress.state}</p>
                <p>PIN: ${invoiceData.customer.billingAddress.pincode}</p>
                <p>Email: ${invoiceData.customer.email}</p>
                <p>Phone: ${invoiceData.customer.phone}</p>
                ${invoiceData.customer.gstNumber ? `<p>GST No: ${invoiceData.customer.gstNumber}</p>` : ""}
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th>S.No</th>
                    <th>Description</th>
                    <th>HSN Code</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Amount</th>
                    <th>Tax Rate</th>
                    <th>Tax Amount</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${invoiceData.items
                  .map(
                    (item, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${item.name}</td>
                        <td>${item.hsnCode}</td>
                        <td>${item.quantity}</td>
                        <td>${formatCurrency(item.price)}</td>
                        <td>${formatCurrency(item.subtotal)}</td>
                        <td>${item.taxRate}%</td>
                        <td>${formatCurrency(item.taxAmount)}</td>
                        <td>${formatCurrency(item.totalWithTax)}</td>
                    </tr>
                `,
                  )
                  .join("")}
            </tbody>
        </table>

        <div class="totals-section">
            <table class="totals-table">
                <tr><td>Subtotal:</td><td>${formatCurrency(invoiceData.amounts.subtotal)}</td></tr>
                ${invoiceData.amounts.discount > 0 ? `<tr><td>Discount:</td><td>-${formatCurrency(invoiceData.amounts.discount)}</td></tr>` : ""}
                ${invoiceData.amounts.shippingCharges > 0 ? `<tr><td>Shipping:</td><td>${formatCurrency(invoiceData.amounts.shippingCharges)}</td></tr>` : ""}
                ${invoiceData.amounts.giftWrapCharges > 0 ? `<tr><td>Gift Wrap:</td><td>${formatCurrency(invoiceData.amounts.giftWrapCharges)}</td></tr>` : ""}
                <tr><td>Taxable Amount:</td><td>${formatCurrency(invoiceData.amounts.taxableAmount)}</td></tr>
                ${invoiceData.amounts.cgst > 0 ? `<tr><td>CGST (9%):</td><td>${formatCurrency(invoiceData.amounts.cgst)}</td></tr>` : ""}
                ${invoiceData.amounts.sgst > 0 ? `<tr><td>SGST (9%):</td><td>${formatCurrency(invoiceData.amounts.sgst)}</td></tr>` : ""}
                ${invoiceData.amounts.igst > 0 ? `<tr><td>IGST (18%):</td><td>${formatCurrency(invoiceData.amounts.igst)}</td></tr>` : ""}
                <tr class="grand-total"><td>Grand Total:</td><td>${formatCurrency(invoiceData.amounts.grandTotal)}</td></tr>
            </table>
        </div>

        <div class="clear"></div>

        <div class="footer">
            <h3>Terms & Conditions:</h3>
            <ul>
                ${invoiceData.terms.map((term) => `<li>${term}</li>`).join("")}
            </ul>
            
            <p><strong>Payment Details:</strong></p>
            <p>Method: ${invoiceData.payment.method}</p>
            <p>Status: ${invoiceData.payment.status}</p>
            ${invoiceData.payment.transactionId ? `<p>Transaction ID: ${invoiceData.payment.transactionId}</p>` : ""}
        </div>
    </body>
    </html>
    `
  },

  // Get invoices by date range
  async getInvoicesByDateRange(startDate, endDate) {
    try {
      const db = admin.firestore()

      let query = db.collection("tax_invoices")

      if (startDate) {
        query = query.where("invoiceDate", ">=", new Date(startDate))
      }

      if (endDate) {
        query = query.where("invoiceDate", "<=", new Date(endDate))
      }

      query = query.orderBy("invoiceDate", "desc")

      const snapshot = await query.get()
      const invoices = []

      snapshot.forEach((doc) => {
        const invoice = doc.data()
        invoices.push({
          invoiceNumber: invoice.invoiceNumber,
          orderNumber: invoice.orderNumber,
          customerName: invoice.customer.name,
          grandTotal: invoice.amounts.grandTotal,
          invoiceDate: invoice.invoiceDate?.toDate()?.toISOString(),
          status: invoice.status,
        })
      })

      return {
        success: true,
        invoices,
      }
    } catch (error) {
      console.error("Get invoices by date range error:", error)
      return {
        success: false,
        error: error.message,
      }
    }
  },
}

module.exports = taxInvoiceLogic
