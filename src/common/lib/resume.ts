// Shared so the cmdline's `:resume`/`:cv` and Profile.svelte's own download button trigger the same action.
const RESUME_HREF = "/assets/resume.pdf";

export function downloadResume(): void {
  window.open(RESUME_HREF, "_blank");
}
