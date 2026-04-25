import React, { useEffect, useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { Clock } from "lucide-react";
import { toast } from "react-hot-toast";
import { getUserTimeZone } from "@/helper/time";

interface EditClassModalProps {
  show: boolean;
  onHide: () => void;
  classId?: string | null;
  initialData?: any;
  userTimezone?: string;
  onSuccess?: (updated?: any) => void;
  customFields?: React.ReactNode;
  // "edit" = normal edit, "reschedule" = treat any change as reschedule
  mode?: "edit" | "reschedule";
}

const extractDateTimeForForm = (iso?: string, tz?: string) => {
  if (!iso) return { dateStr: "", timeStr: "" };
  const d = new Date(iso);
  const timeZone =
    tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const hour =
    parts.find((p) => p.type === "hour")?.value?.padStart(2, "0") || "00";
  const minute =
    parts.find((p) => p.type === "minute")?.value?.padStart(2, "0") || "00";
  return { dateStr: `${year}-${month}-${day}`, timeStr: `${hour}:${minute}` };
};

const EditClassModal: React.FC<EditClassModalProps> = ({
  show,
  onHide,
  classId,
  initialData,
  userTimezone,
  onSuccess,
  customFields,
  mode = "edit",
}) => {
  const isRescheduleMode = mode === "reschedule";
  const tz = userTimezone || getUserTimeZone();

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
  });
  const [original, setOriginal] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
  });
  const [reasonForReschedule, setReasonForReschedule] = useState("");
  const [hasRecurrence, setHasRecurrence] = useState(false);

  const hasDateChanged = form.date && form.date !== original.date;
  const hasTimeChanged =
    (form.startTime && form.startTime !== original.startTime) ||
    (form.endTime && form.endTime !== original.endTime);
  const hasScheduleChanged = !!(hasDateChanged || hasTimeChanged);
  const hasTitleChanged = form.title !== original.title;
  const hasDescriptionChanged = form.description !== original.description;
  const hasMetaChanged = hasTitleChanged || hasDescriptionChanged;
  const hasAnythingChanged = !!(hasScheduleChanged || hasMetaChanged);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!show) return;
      setError("");
      setLoading(true);
      setIsSaving(false); // reset saving state whenever modal is opened

      const effectiveTz =
        tz || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

      if (initialData) {
        const start = extractDateTimeForForm(
          initialData.startTime,
          effectiveTz
        );
        const end = extractDateTimeForForm(initialData.endTime, effectiveTz);
        if (!mounted) return;
        setForm({
          title: initialData.title || "",
          description: initialData.description || "",
          date: start.dateStr || "",
          startTime: start.timeStr || "",
          endTime: end.timeStr || "",
        });
        setOriginal({
          title: initialData.title || "",
          description: initialData.description || "",
          date: start.dateStr || "",
          startTime: start.timeStr || "",
          endTime: end.timeStr || "",
        });
        setReasonForReschedule(initialData.reasonForReschedule || "");
        setHasRecurrence(!!initialData.recurrenceId);
        setLoading(false);
        return;
      }

      if (!classId) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/Api/calendar/classes?classId=${classId}`);
        const data = await res.json();
        const cls =
          Array.isArray(data) ? data[0] : data.classData?.[0] || data.class || data;
        if (!cls) throw new Error("Class data not found");
        const start = extractDateTimeForForm(cls.startTime, effectiveTz);
        const end = extractDateTimeForForm(cls.endTime, effectiveTz);
        if (!mounted) return;
        setForm({
          title: cls.title || "",
          description: cls.description || "",
          date: start.dateStr || "",
          startTime: start.timeStr || "",
          endTime: end.timeStr || "",
        });
        setOriginal({
          title: cls.title || "",
          description: cls.description || "",
          date: start.dateStr || "",
          startTime: start.timeStr || "",
          endTime: end.timeStr || "",
        });
        setReasonForReschedule(cls.reasonForReschedule || "");
        setHasRecurrence(!!cls.recurrenceId);
      } catch (err: any) {
        console.error("Failed to load class:", err);
        setError(err?.message || "Failed to load class");
        toast.error("Failed to load class details");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [show, classId, initialData, tz]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  };

  const validate = () => {
    if (!form.title.trim()) return "Title is required";
    if (!form.date || !form.startTime || !form.endTime)
      return "Date and times are required";
    if (form.endTime <= form.startTime)
      return "End time must be after start time";
    const needsRescheduleReason = isRescheduleMode && hasAnythingChanged;
    if (needsRescheduleReason && !reasonForReschedule.trim())
      return "Please provide a reason for rescheduling";
    return "";
  };

  const submitWithType = async (
    e: React.FormEvent | null,
    editType: "single" | "all"
  ) => {
    if (e) e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    const id = classId || initialData?._id;
    if (!id) {
      setError("Class id not available");
      return;
    }

    setIsSaving(true);
    setError("");

    const timezoneToSend =
      userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    const includeReason = isRescheduleMode && hasAnythingChanged;
    const nextStatus = isRescheduleMode
      ? hasAnythingChanged
        ? "rescheduled"
        : undefined
      : hasAnythingChanged
        ? "scheduled"
        : undefined;

    const payload = {
      title: form.title,
      description: form.description,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      timezone: timezoneToSend,
      reasonForReschedule: includeReason ? reasonForReschedule : "",
      updateIntent: isRescheduleMode ? "reschedule" : "edit",
      status: nextStatus,
    };

    // Build ISO strings for UI state so calendar logic keeps working
    const buildIsoFromDateTime = (dateStr: string, timeStr: string) => {
      try {
        if (!dateStr || !timeStr) return undefined;
        const [y, m, d] = dateStr.split("-").map(Number);
        const [hh, mm] = timeStr.split(":").map(Number);
        const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
        if (isNaN(dt.getTime())) return undefined;
        return dt.toISOString();
      } catch {
        return undefined;
      }
    };

    const newStartIso =
      buildIsoFromDateTime(form.date, form.startTime) ||
      initialData?.startTime;
    const newEndIso =
      buildIsoFromDateTime(form.date, form.endTime) || initialData?.endTime;

    // Optimistic UI: notify parent and close modal immediately
    if (onSuccess) {
      const updatedForUi = {
        ...(initialData || {}),
        title: form.title,
        description: form.description,
        startTime: newStartIso,
        endTime: newEndIso,
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(includeReason && reasonForReschedule.trim()
          ? {
              rescheduleReason: reasonForReschedule,
              reasonForReschedule: reasonForReschedule,
            }
          : {}),
      };
      onSuccess(updatedForUi);
    }
    onHide();

    // Do network work in background
    (async () => {
      try {
        const res = await fetch(
          `/Api/classes?classId=${id}&editType=${editType}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data.message || data.error || "Update failed");

        toast.success(
          editType === "all"
            ? `Updated series${data.updatedCount ? ` (${data.updatedCount})` : ""}`
            : "Class updated"
        );
      } catch (err: any) {
        console.error("Update error:", err);
        const msg = err?.message || "Failed to update class";
        toast.error(msg);
      } finally {
        // allow future edits
        setIsSaving(false);
      }
    })();
  };

  const isSaveDisabled = !!validate() || isSaving;
  const modalTitle = loading
    ? "Loading..."
    : isRescheduleMode
      ? "Reschedule Class"
      : "Edit Class";

  return (
    <Modal show={show} onHide={onHide} centered dialogClassName="max-w-md">
      <Modal.Header closeButton>
        <Modal.Title>{modalTitle}</Modal.Title>
      </Modal.Header>

      <Form onSubmit={(e) => submitWithType(e, "single")}>
        <Modal.Body>
          {error && (
            <div className="text-sm text-red-600 mb-3 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <Form.Group className="mb-3">
            <Form.Label>Title</Form.Label>
            <Form.Control
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Session title"
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Description</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Session description"
            />
          </Form.Group>

          <div className="d-flex gap-2">
            <div style={{ flex: 1 }}>
              <Form.Label>Date</Form.Label>
              <Form.Control
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="time"
                name="startTime"
                value={form.startTime}
                onChange={handleChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Form.Label>End</Form.Label>
              <Form.Control
                type="time"
                name="endTime"
                value={form.endTime}
                onChange={handleChange}
              />
            </div>
          </div>

          {isRescheduleMode && hasAnythingChanged && (
            <Form.Group className="mt-3">
              <Form.Label>
                Reason for Reschedule <span className="text-red-500">*</span>
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={reasonForReschedule}
                onChange={(e) => setReasonForReschedule(e.target.value)}
                placeholder="Please provide a reason for rescheduling this class..."
              />
              <div className="text-xs text-gray-500 mt-1">
                Students will be notified about this change
              </div>
            </Form.Group>
          )}

          {customFields}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSaveDisabled}
            title={
              isRescheduleMode
                ? "Reschedule only this occurrence"
                : "Apply only to this occurrence"
            }
          >
            {isSaving ? (
              <>
                <Clock className="w-4 h-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              isRescheduleMode ? "save this event" : "Save"
            )}
          </Button>
          <Button
            type="button"
            variant="warning"
            disabled={isSaveDisabled || !hasRecurrence}
            onClick={(e) => submitWithType(e as any, "all")}
            title={
              hasRecurrence
                ? isRescheduleMode
                  ? "Reschedule all events in this series"
                  : "Apply to all events in this series"
                : "This event is not part of a series"
            }
          >
            {isSaving ? (
              <>
                <Clock className="w-4 h-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              isRescheduleMode
                ? "save all in series"
                : "Save all in series"
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default EditClassModal;