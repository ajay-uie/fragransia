interface ShippingAddress {
  name: string
  phone: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
}

interface ShipmentData {
  order_id: string
  order_date: string
  pickup_location: string
  billing_customer_name: string
  billing_last_name: string
  billing_address: string
  billing_city: string
  billing_pincode: string
  billing_state: string
  billing_country: string
  billing_email: string
  billing_phone: string
  shipping_is_billing: boolean
  order_items: Array<{
    name: string
    sku: string
    units: number
    selling_price: number
  }>
  payment_method: string
  sub_total: number
  length: number
  breadth: number
  height: number
  weight: number
}

interface ShippingRate {
  courier_company_id: number
  courier_name: string
  rate: number
  estimated_delivery_days: string
}

class ShippingService {
  private baseUrl = "https://apiv2.shiprocket.in/v1/external"
  private token: string | null = null

  async authenticate(): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: process.env.SHIPROCKET_EMAIL,
          password: process.env.SHIPROCKET_PASSWORD,
        }),
      })

      if (!response.ok) {
        throw new Error("Shiprocket authentication failed")
      }

      const data = await response.json()
      this.token = data.token
      return data.token
    } catch (error) {
      console.error("Shiprocket authentication error:", error)
      throw error
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.token) {
      await this.authenticate()
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    }
  }

  async checkServiceability(pincode: string): Promise<boolean> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(
        `${this.baseUrl}/courier/serviceability/?pickup_postcode=110001&delivery_postcode=${pincode}&weight=1&cod=0`,
        {
          headers,
        },
      )

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      return data.status === 200 && data.data.available_courier_companies.length > 0
    } catch (error) {
      console.error("Serviceability check error:", error)
      return false
    }
  }

  async getShippingRates(
    pickupPincode: string,
    deliveryPincode: string,
    weight: number,
    cod = false,
  ): Promise<ShippingRate[]> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(
        `${this.baseUrl}/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${cod ? 1 : 0}`,
        { headers },
      )

      if (!response.ok) {
        throw new Error("Failed to get shipping rates")
      }

      const data = await response.json()
      return data.data.available_courier_companies || []
    } catch (error) {
      console.error("Shipping rates error:", error)
      return []
    }
  }

  async createShipment(shipmentData: ShipmentData): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/orders/create/adhoc`, {
        method: "POST",
        headers,
        body: JSON.stringify(shipmentData),
      })

      if (!response.ok) {
        throw new Error("Failed to create shipment")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Shipment creation error:", error)
      throw error
    }
  }

  async trackShipment(awbCode: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/courier/track/awb/${awbCode}`, {
        headers,
      })

      if (!response.ok) {
        throw new Error("Failed to track shipment")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Shipment tracking error:", error)
      throw error
    }
  }

  async cancelShipment(awbCode: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/orders/cancel`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          awbs: [awbCode],
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to cancel shipment")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Shipment cancellation error:", error)
      throw error
    }
  }

  async generateLabel(shipmentId: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/courier/generate/label`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          shipment_id: shipmentId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to generate label")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Label generation error:", error)
      throw error
    }
  }

  async getPickupLocations(): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const response = await fetch(`${this.baseUrl}/settings/company/pickup`, {
        headers,
      })

      if (!response.ok) {
        throw new Error("Failed to get pickup locations")
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error("Pickup locations error:", error)
      throw error
    }
  }
}

export const shippingService = new ShippingService()
