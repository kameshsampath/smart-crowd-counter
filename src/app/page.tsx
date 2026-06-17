"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import useSWR from "swr";
import FileUploader from "@/components/FileUploader";
import DataTable, { ImageRow } from "@/components/DataTable";
import MetricsCards from "@/components/MetricsCards";
import DonutChart from "@/components/DonutChart";
import ImageViewer from "@/components/ImageViewer";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const prevRowCount = useRef<number>(0);
  const expectedCount = useRef<number>(0);

  // Main data: full view with AI analysis
  const { data, mutate, isLoading } = useSWR("/api/images", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    refreshInterval: polling ? 5000 : 0,
  });

  // Lightweight sync: poll file count every 10s to detect external changes
  const { data: countData } = useSWR("/api/file-count", fetcher, {
    refreshInterval: 10000,
    revalidateOnFocus: true,
  });

  const rows: ImageRow[] = data?.data || [];
  const stageFileCount: number = countData?.count ?? rows.length;

  // If file count differs from row count, refetch the full view
  useEffect(() => {
    if (data && stageFileCount !== rows.length) {
      mutate(undefined, { revalidate: true });
    }
  }, [stageFileCount, rows.length, data, mutate]);

  // Stop upload-polling when new rows appear
  useEffect(() => {
    if (polling && rows.length >= expectedCount.current) {
      setPolling(false);
    }
    prevRowCount.current = rows.length;
  }, [rows.length, polling]);

  const selectedRow = selectedIndex != null ? rows[selectedIndex] : null;

  const handleUploadComplete = useCallback((uploadedCount: number) => {
    expectedCount.current = prevRowCount.current + uploadedCount;
    setPolling(true);
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Smart Crowd Counter
        </h1>
        <p className="text-gray-600 mt-2 max-w-2xl">
          Upload conference session photos and let AI analyze attendee counts and
          engagement. Powered by Snowflake Cortex AI.
        </p>
      </header>

      <section className="mb-6">
        <FileUploader
          onUploadComplete={handleUploadComplete}
          disabled={!data}
        />
      </section>

      <section className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Session Data
          {rows.length > 0 && (
            <span className="text-sm font-normal text-gray-400 ml-2">
              ({rows.length} {rows.length === 1 ? "image" : "images"})
            </span>
          )}
        </h2>
        {polling && (
          <span className="text-xs text-blue-600 animate-pulse">
            Processing {expectedCount.current - prevRowCount.current} new{" "}
            {expectedCount.current - prevRowCount.current === 1
              ? "image"
              : "images"}
            ...
          </span>
        )}
        {isLoading && !polling && (
          <span className="text-xs text-gray-400">Refreshing...</span>
        )}
      </section>

      {data?.error && (
        <div className="mb-6 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
          {data.error}
        </div>
      )}

      <section className="mb-6">
        <DataTable
          data={rows}
          selectedIndex={selectedIndex}
          onRowSelect={setSelectedIndex}
        />
      </section>

      {selectedRow && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <ImageViewer row={selectedRow} />
          </div>
          <div className="space-y-4">
            <MetricsCards
              totalAttendees={selectedRow.TOTAL_ATTENDEES}
              raisedHands={selectedRow.RAISED_HANDS}
              conversionRate={selectedRow.PERCENTAGE_WITH_HANDS_UP}
            />
            <DonutChart
              totalAttendees={selectedRow.TOTAL_ATTENDEES || 0}
              raisedHands={selectedRow.RAISED_HANDS || 0}
            />
          </div>
        </section>
      )}

      <footer className="mt-12 pt-6 border-t text-center text-xs text-gray-400">
        Built with Next.js on Snowflake App Runtime
      </footer>
    </main>
  );
}
