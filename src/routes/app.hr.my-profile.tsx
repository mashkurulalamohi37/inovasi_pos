import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { PageHeader, PageBody, SectionCard, StatusBadge } from "@/components/pulse/primitives";
import { LoadingState, ErrorState } from "@/components/pulse/states";
import { shouldUseBackend } from "@/lib/demo-mode";
import { useMiniHrMyProfile, useUploadMiniHrPhoto, useUploadMyProfilePhoto } from "@/hooks/use-mini-hr";
import { useAuth } from "@/lib/auth-provider";
import { toast } from "sonner";
import { formatApiError, resolveMediaUrl } from "@/lib/api";
import { Camera, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/hr/my-profile")({ component: MyProfilePage });

function MyProfilePage() {
  const useApi = shouldUseBackend();
  const { user } = useAuth();
  const { data: apiData, isLoading, isError, error, refetch } = useMiniHrMyProfile(useApi);
  const uploadMyPhotoMut = useUploadMyProfilePhoto();
  const uploadPhotoMut = useUploadMiniHrPhoto();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const isUploading = uploadMyPhotoMut.isPending || uploadPhotoMut.isPending;

  const demoProfile = {
    id: "emp-demo-admin",
    full_name: "Mashfak Admin",
    first_name: "Mashfak",
    last_name: "Admin",
    employee_code: "EMP-ADMIN",
    employee_status: "active",
    mobile: "+880 1700-000001",
    email: "admin@pulse.pos",
    photo_url: undefined,
    designation_title: "Store General Manager",
    department_name: "HR & Administration",
    joining_date: "2024-01-01",
    employment_type: "full_time",
    stores: [{ id: "str_dhk_01", store_name: "Banani Flagship (DHK-01)" }],
  };

  const fallbackProfile = user ? {
    id: user.id || "unknown",
    full_name: user.full_name || "User Profile",
    first_name: user.full_name ? user.full_name.split(" ")[0] : "User",
    last_name: user.full_name ? user.full_name.split(" ").slice(1).join(" ") : "",
    employee_code: user.username || "—",
    employee_status: "active",
    mobile: "—",
    email: user.email || "—",
    photo_url: undefined,
    designation_title: user.role_code ? (user.role_code.charAt(0).toUpperCase() + user.role_code.slice(1)) : "Staff",
    department_name: "General Staff",
    joining_date: "—",
    employment_type: "—",
    stores: user.store_name ? [{ id: user.store_id || "store", store_name: `${user.store_name} (${user.store_code || "—"})`, is_active: true }] : [],
    is_fallback: true
  } : undefined;

  const data = apiData || (!useApi ? demoProfile : fallbackProfile);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file size must be under 5MB");
      return;
    }

    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Unsupported file type. Please upload a PNG, JPG, WEBP, or GIF image.");
      return;
    }

    try {
      if (useApi) {
        // Try dedicated my-profile endpoint first, or employee-specific if available
        if (data?.id && !(data as any).is_fallback) {
          await uploadPhotoMut.mutateAsync({ employeeId: data.id, file });
        } else {
          await uploadMyPhotoMut.mutateAsync(file);
        }
        setImgError(false);
        setLocalPreview(null);
        await refetch();
        toast.success("Profile photo uploaded successfully");
      } else {
        // Local preview in demo mode
        const previewUrl = URL.createObjectURL(file);
        setLocalPreview(previewUrl);
        setImgError(false);
        toast.success("Profile photo updated (demo preview)");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const photoSrc = resolveMediaUrl(localPreview || data?.photo_url);

  return (
    <>
      <PageHeader title="My profile" subtitle="Employment identity linked to your login" />
      <PageBody className="space-y-6">
        {isLoading ? <LoadingState /> : null}
        {isError && !data ? (
          <ErrorState
            title="No employee profile"
            description={(error as { message?: string })?.message || "This account is not linked to a Mini HR employee record."}
          />
        ) : null}
        
        {data ? (
          <SectionCard title={data.full_name}>
            <div className="flex flex-col gap-6 md:flex-row md:items-start p-4">
              
              {/* Profile Picture Upload & Display */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  {photoSrc && !imgError ? (
                    <img
                      src={photoSrc}
                      alt={data.full_name}
                      onError={() => setImgError(true)}
                      className="h-28 w-28 rounded-full object-cover border-4 border-border/80 shadow-md bg-muted transition-opacity group-hover:opacity-90"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10 font-display text-4xl font-bold text-primary border-2 border-primary/20 shadow-inner">
                      {data.first_name?.[0] || "U"}{(data.last_name || "")[0] || ""}
                    </div>
                  )}

                  {/* Clickable Overlay */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-xs text-white font-medium rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed cursor-pointer focus:outline-none"
                    title="Upload profile photo"
                  >
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    ) : (
                      <>
                        <Camera className="h-5 w-5 mb-1" />
                        <span>{data.photo_url || localPreview ? "Change Photo" : "Upload Photo"}</span>
                      </>
                    )}
                  </button>

                  {/* Visible Camera Badge at bottom-right */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 transition-transform active:scale-95 border-2 border-background cursor-pointer disabled:cursor-not-allowed"
                    title="Upload new photo"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>

                {/* Explicit Action Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-xs h-8 gap-1.5 shadow-sm"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5" />
                      {data.photo_url || localPreview ? "Change Photo" : "Upload Photo"}
                    </>
                  )}
                </Button>

                <div className="text-[10px] text-muted-foreground text-center">
                  PNG, JPG, WEBP, GIF up to 5MB
                </div>
              </div>

              {/* Profile Details List */}
              <div className="flex-1">
                <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee Code</dt>
                    <dd className="mt-1 font-mono font-medium text-foreground">{data.employee_code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employment Status</dt>
                    <dd className="mt-1"><StatusBadge status={data.employee_status} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mobile Number</dt>
                    <dd className="mt-1 text-foreground">{data.mobile || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</dt>
                    <dd className="mt-1 text-foreground">{data.email || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joining Date</dt>
                    <dd className="mt-1 text-foreground">{data.joining_date || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Store Assignments</dt>
                    <dd className="mt-1 text-foreground">{(data.stores ?? []).filter(s => (s as any).is_active !== false).length} store(s) assigned</dd>
                  </div>
                </dl>
              </div>

            </div>
          </SectionCard>
        ) : null}
      </PageBody>
    </>
  );
}
