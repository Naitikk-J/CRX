import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  User,
  Leaf,
  ShoppingCart,
  Flame,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Loader2,
  LogOut,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Types
interface UserProfile {
  id: string;
  username: string;
  crx_balance: number;
  avatar_url: string | null;
}

interface Transaction {
  id: string;
  action: string;
  amount: number;
  created_at: string;
  tx_hash: string;
}

interface MarketListing {
  id: string;
  amount: number;
  price_per_credit: number;
  seller_id: string;
  profiles: {
    username: string;
  };
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [currentPage, setCurrentPage] = useState<"landing" | "profile" | "mint" | "sell" | "burn">("landing");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [marketListings, setMarketListings] = useState<MarketListing[]>([]);

  // Form states
  const [mintAmount, setMintAmount] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showBurnDialog, setShowBurnDialog] = useState(false);

  // Check authentication and load user data
  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setUserProfile(null);
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load user profile
  const loadUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Error loading profile:", error);
      return;
    }

    setUserProfile(data);
    loadTransactions(userId);
  };

  // Load transactions
  const loadTransactions = async (userId: string) => {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error loading transactions:", error);
      return;
    }

    setTransactions(data || []);
  };

  // Load marketplace listings
  const loadMarketListings = async () => {
    const { data, error } = await supabase
      .from("marketplace_listings")
      .select(`
        *,
        profiles!seller_id(username)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error loading marketplace:", error);
      return;
    }

    setMarketListings(data || []);
  };

  useEffect(() => {
    if (currentPage === "sell") {
      loadMarketListings();
    }
  }, [currentPage]);

  // Sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Handle mint credits
  const handleMint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user || !userProfile) return;

    if (!mintAmount || !projectName || !projectDescription) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Create project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: session.user.id,
          name: projectName,
          description: projectDescription,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Create carbon credits
      const { error: creditError } = await supabase
        .from("carbon_credits")
        .insert({
          owner_id: session.user.id,
          project_id: project.id,
          amount: parseInt(mintAmount),
          status: "active",
        });

      if (creditError) throw creditError;

      // Update user balance
      const newBalance = userProfile.crx_balance + parseInt(mintAmount);
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ crx_balance: newBalance })
        .eq("id", session.user.id);

      if (balanceError) throw balanceError;

      // Create transaction record
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: session.user.id,
          action: "Mint",
          amount: parseInt(mintAmount),
          tx_hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 5)}`,
        });

      if (txError) throw txError;

      toast({
        title: "Credits Minted Successfully",
        description: `${mintAmount} CRX tokens have been minted to your account.`,
      });

      // Reload data
      loadUserProfile(session.user.id);
      setMintAmount("");
      setProjectName("");
      setProjectDescription("");
    } catch (error: any) {
      console.error("Mint error:", error);
      toast({
        title: "Minting Failed",
        description: error.message || "An error occurred while minting credits.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle sell credits
  const handleSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user || !userProfile) return;

    if (!sellAmount || !sellPrice) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    const amount = parseInt(sellAmount);
    if (amount > userProfile.crx_balance) {
      toast({
        title: "Insufficient Balance",
        description: "You don't have enough credits to sell.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Get user's active credits
      const { data: credits, error: creditsError } = await supabase
        .from("carbon_credits")
        .select("*")
        .eq("owner_id", session.user.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (creditsError) throw creditsError;

      // Create marketplace listing
      const { error: listingError } = await supabase
        .from("marketplace_listings")
        .insert({
          seller_id: session.user.id,
          credit_id: credits.id,
          amount: amount,
          price_per_credit: parseFloat(sellPrice),
          status: "active",
        });

      if (listingError) throw listingError;

      // Update credit status
      const { error: statusError } = await supabase
        .from("carbon_credits")
        .update({ status: "listed" })
        .eq("id", credits.id);

      if (statusError) throw statusError;

      // Update user balance
      const newBalance = userProfile.crx_balance - amount;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ crx_balance: newBalance })
        .eq("id", session.user.id);

      if (balanceError) throw balanceError;

      // Create transaction record
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: session.user.id,
          action: "Sell",
          amount: amount,
          credit_id: credits.id,
          tx_hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 5)}`,
        });

      if (txError) throw txError;

      toast({
        title: "Listing Created",
        description: `${sellAmount} CRX tokens listed for sale at ${sellPrice} ETH each.`,
      });

      // Reload data
      loadUserProfile(session.user.id);
      loadMarketListings();
      setSellAmount("");
      setSellPrice("");
    } catch (error: any) {
      console.error("Sell error:", error);
      toast({
        title: "Listing Failed",
        description: error.message || "An error occurred while creating the listing.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle burn credits
  const handleBurn = async () => {
    if (!session?.user || !userProfile) return;

    const amount = parseInt(burnAmount);
    if (amount > userProfile.crx_balance) {
      toast({
        title: "Insufficient Balance",
        description: "You don't have enough credits to burn.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setShowBurnDialog(false);

    try {
      // Get user's active credits
      const { data: credits, error: creditsError } = await supabase
        .from("carbon_credits")
        .select("*")
        .eq("owner_id", session.user.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (creditsError) throw creditsError;

      // Update credit status to burned
      const { error: statusError } = await supabase
        .from("carbon_credits")
        .update({ status: "burned" })
        .eq("id", credits.id);

      if (statusError) throw statusError;

      // Update user balance
      const newBalance = userProfile.crx_balance - amount;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ crx_balance: newBalance })
        .eq("id", session.user.id);

      if (balanceError) throw balanceError;

      // Create transaction record
      const { error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: session.user.id,
          action: "Burn",
          amount: amount,
          credit_id: credits.id,
          tx_hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 5)}`,
        });

      if (txError) throw txError;

      toast({
        title: "Credits Burned Successfully",
        description: `${burnAmount} CRX tokens have been permanently retired.`,
      });

      // Reload data
      loadUserProfile(session.user.id);
      setBurnAmount("");
    } catch (error: any) {
      console.error("Burn error:", error);
      toast({
        title: "Burn Failed",
        description: error.message || "An error occurred while burning credits.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Navbar Component
  const Navbar = () => (
    <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Leaf className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            CRX
          </span>
        </div>

        {session && (
          <div className="hidden md:flex gap-6">
            <button
              onClick={() => setCurrentPage("profile")}
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                currentPage === "profile" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <User className="h-4 w-4" />
              Profile
            </button>
            <button
              onClick={() => setCurrentPage("mint")}
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                currentPage === "mint" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Leaf className="h-4 w-4" />
              Mint
            </button>
            <button
              onClick={() => setCurrentPage("sell")}
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                currentPage === "sell" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              Marketplace
            </button>
            <button
              onClick={() => setCurrentPage("burn")}
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                currentPage === "burn" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Flame className="h-4 w-4" />
              Burn
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {!session ? (
            <Button onClick={() => navigate("/auth")} variant="hero" size="lg">
              <User className="h-4 w-4" />
              Sign In
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {userProfile?.username || "User"}
              </span>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );

  // Landing Page
  const LandingPage = () => (
    <div className="min-h-[calc(100vh-73px)] flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-4xl mx-auto space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Carbon Credit Exchange
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150">
            Mint, trade, and burn carbon credits on the blockchain. Join the fight against climate change.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
          {!session ? (
            <Button onClick={() => navigate("/auth")} variant="hero" size="lg" className="text-lg px-8">
              <User className="h-5 w-5" />
              Sign In to Get Started
            </Button>
          ) : (
            <>
              <Button onClick={() => setCurrentPage("profile")} variant="default" size="lg" className="text-lg px-8">
                <User className="h-5 w-5" />
                View Profile
              </Button>
              <Button onClick={() => setCurrentPage("mint")} variant="secondary" size="lg" className="text-lg px-8">
                <Leaf className="h-5 w-5" />
                Start Minting
              </Button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
          <Card className="border-primary/20 hover:border-primary/40 transition-colors">
            <CardHeader>
              <Leaf className="h-12 w-12 text-primary mb-4" />
              <CardTitle>Mint Credits</CardTitle>
              <CardDescription>Create verified carbon credits linked to environmental projects</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-secondary/20 hover:border-secondary/40 transition-colors">
            <CardHeader>
              <TrendingUp className="h-12 w-12 text-secondary mb-4" />
              <CardTitle>Trade</CardTitle>
              <CardDescription>Buy and sell credits on our decentralized marketplace</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-accent/20 hover:border-accent/40 transition-colors">
            <CardHeader>
              <Flame className="h-12 w-12 text-accent mb-4" />
              <CardTitle>Burn</CardTitle>
              <CardDescription>Retire credits to permanently offset your carbon footprint</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );

  // Profile Page
  const ProfilePage = () => {
    if (!userProfile) return null;

    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-4xl font-bold mb-8">Profile</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold text-white">
                  {userProfile.username.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-lg">{userProfile.username}</p>
                  <p className="text-sm text-muted-foreground">Active Member</p>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <p className="font-mono text-sm break-all">{userProfile.id}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Token Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">CRX Balance</p>
                <p className="text-3xl font-bold text-primary">{userProfile.crx_balance} CRX</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Your recent activity on the CRX platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transactions yet</p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          tx.action === "Mint"
                            ? "bg-primary/10 text-primary"
                            : tx.action === "Sell"
                            ? "bg-secondary/10 text-secondary"
                            : tx.action === "Burn"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-accent/10 text-accent"
                        }`}
                      >
                        {tx.action === "Mint" && <Leaf className="h-5 w-5" />}
                        {tx.action === "Sell" && <ShoppingCart className="h-5 w-5" />}
                        {tx.action === "Burn" && <Flame className="h-5 w-5" />}
                        {tx.action === "Buy" && <CheckCircle className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-semibold">{tx.action} Credits</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{tx.amount} CRX</p>
                      <p className="text-xs text-muted-foreground font-mono">{tx.tx_hash}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Mint Page
  const MintPage = () => (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-6 w-6" />
            Mint New Carbon Credits
          </CardTitle>
          <CardDescription>Create verified carbon credits linked to environmental projects</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMint} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="mintAmount">Amount of Credits</Label>
              <Input
                id="mintAmount"
                type="number"
                placeholder="Enter amount to mint"
                value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                min="1"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                type="text"
                placeholder="e.g., Amazon Reforestation Project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectDescription">Project Description</Label>
              <Textarea
                id="projectDescription"
                placeholder="Describe the environmental project..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={4}
                required
              />
            </div>

            <Button type="submit" disabled={isLoading} className="w-full" size="lg">
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Minting...
                </>
              ) : (
                <>
                  <CheckCircle className="h-5 w-5" />
                  Mint Credits
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );

  // Sell/Marketplace Page
  const SellPage = () => (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" />
            List Your Credits for Sale
          </CardTitle>
          <CardDescription>Set your price and list credits on the marketplace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSell} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sellAmount">Amount</Label>
              <Input
                id="sellAmount"
                type="number"
                placeholder="Credits to sell"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                min="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sellPrice">Price per Credit (ETH)</Label>
              <Input
                id="sellPrice"
                type="number"
                step="0.001"
                placeholder="0.05"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                min="0.001"
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Listing...
                  </>
                ) : (
                  "Create Listing"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-3xl font-bold mb-6">Marketplace</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {marketListings.length === 0 ? (
            <p className="col-span-full text-center text-muted-foreground py-8">No listings available</p>
          ) : (
            marketListings.map((listing) => (
              <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{listing.amount} CRX</span>
                    <span className="text-2xl font-bold text-primary">{listing.price_per_credit} ETH</span>
                  </CardTitle>
                  <CardDescription>per credit</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Seller</Label>
                    <p className="font-medium">{listing.profiles?.username || "Unknown"}</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Total Price</Label>
                    <p className="text-xl font-bold">
                      {(listing.amount * Number(listing.price_per_credit)).toFixed(4)} ETH
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    disabled={listing.seller_id === session?.user.id}
                  >
                    {listing.seller_id === session?.user.id ? "Your Listing" : "Buy Credits"}
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Burn Page
  const BurnPage = () => (
    <>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-6 w-6 text-destructive" />
              Burn Carbon Credits
            </CardTitle>
            <CardDescription>Permanently retire credits from circulation to offset emissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">What does burning mean?</p>
                  <p className="text-sm text-muted-foreground">
                    Burning credits permanently removes them from circulation, effectively retiring them to offset your
                    carbon emissions. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="burnAmount">Amount to Burn</Label>
              <Input
                id="burnAmount"
                type="number"
                placeholder="Enter amount to burn"
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                min="1"
                max={userProfile?.crx_balance || 0}
              />
              <p className="text-xs text-muted-foreground">
                Available balance: {userProfile?.crx_balance || 0} CRX
              </p>
            </div>

            <Button
              variant="destructive"
              className="w-full"
              size="lg"
              disabled={!burnAmount || isLoading}
              onClick={() => setShowBurnDialog(true)}
            >
              <Flame className="h-5 w-5" />
              Burn Credits
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showBurnDialog} onOpenChange={setShowBurnDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently burn {burnAmount} CRX tokens. This action cannot be undone and the credits
              will be retired from circulation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBurn} className="bg-destructive hover:bg-destructive/90">
              Confirm Burn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {currentPage === "landing" && <LandingPage />}
      {currentPage === "profile" && session && <ProfilePage />}
      {currentPage === "mint" && session && <MintPage />}
      {currentPage === "sell" && session && <SellPage />}
      {currentPage === "burn" && session && <BurnPage />}
    </div>
  );
};

export default Index;
