"use client"

import { useState, useEffect } from "react"
import { User, Shield, ShieldOff, Search, Filter, MoreVertical, Phone, Mail, Calendar, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { collection, query, onSnapshot, doc, updateDoc, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase"

interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  role: "user" | "admin"
  phone?: string
  phoneVerified?: boolean
  addresses?: Array<{
    id: string
    label: string
    street: string
    city: string
    state: string
    zipCode: string
    country: string
    isDefault: boolean
  }>
  preferences?: {
    newsletter: boolean
    notifications: boolean
  }
  createdAt: any
  updatedAt: any
}

export default function UsersManagement() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState<"all" | "user" | "admin">("all")

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map((doc) => ({
        ...doc.data(),
        uid: doc.id,
      })) as UserProfile[]

      setUsers(usersData)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const toggleUserRole = async (userId: string, currentRole: string) => {
    try {
      const newRole = currentRole === "admin" ? "user" : "admin"
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
        updatedAt: new Date(),
      })
    } catch (error) {
      console.error("Error updating user role:", error)
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = filterRole === "all" || user.role === filterRole
    return matchesSearch && matchesRole
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-light text-white">Users Management</h2>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-gray-800 border-gray-700 text-white">
                <Filter className="w-4 h-4 mr-2" />
                {filterRole === "all" ? "All Users" : filterRole === "admin" ? "Admins" : "Users"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-gray-800 border-gray-700">
              <DropdownMenuItem onClick={() => setFilterRole("all")} className="text-white">
                All Users
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterRole("user")} className="text-white">
                Users Only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterRole("admin")} className="text-white">
                Admins Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-700">
              <TableHead className="text-gray-300">User</TableHead>
              <TableHead className="text-gray-300">Contact</TableHead>
              <TableHead className="text-gray-300">Role</TableHead>
              <TableHead className="text-gray-300">Addresses</TableHead>
              <TableHead className="text-gray-300">Joined</TableHead>
              <TableHead className="text-gray-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.uid} className="border-gray-700">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL || "/placeholder.svg"}
                          alt={user.displayName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-medium">{user.displayName}</p>
                      <p className="text-gray-400 text-sm">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">{user.email}</span>
                    </div>
                    {user.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-300">{user.phone}</span>
                        {user.phoneVerified && (
                          <Badge variant="secondary" className="bg-green-900 text-green-300 text-xs">
                            Verified
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.role === "admin" ? "default" : "secondary"}
                    className={user.role === "admin" ? "bg-red-900 text-red-300" : "bg-gray-700 text-gray-300"}
                  >
                    {user.role === "admin" ? (
                      <>
                        <Shield className="w-3 h-3 mr-1" />
                        Admin
                      </>
                    ) : (
                      <>
                        <User className="w-3 h-3 mr-1" />
                        User
                      </>
                    )}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    {user.addresses?.length || 0} address{(user.addresses?.length || 0) !== 1 ? "es" : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    {user.createdAt?.toDate?.()?.toLocaleDateString() || "N/A"}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 border-gray-700">
                      <DropdownMenuItem
                        onClick={() => toggleUserRole(user.uid, user.role)}
                        className="text-white hover:bg-gray-700"
                      >
                        {user.role === "admin" ? (
                          <>
                            <ShieldOff className="w-4 h-4 mr-2" />
                            Demote to User
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 mr-2" />
                            Promote to Admin
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <User className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">No users found</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-400">
        <p>Total users: {users.length}</p>
        <p>Admins: {users.filter((u) => u.role === "admin").length}</p>
      </div>
    </div>
  )
}
