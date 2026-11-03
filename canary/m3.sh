bash canary/emit.sh | perl -pe '
s{\Qsrc-rail.canary-internal.net\E}{[R]}g;
s{\QSRC-RAIL.CANARY-INTERNAL.NET\E}{[R]}g;
s{\Qsrc-rail%2Ecanary-internal%2Enet\E}{[R]}g;
s{\Qsk-canary-9f8e7d6c5b4a39281706f5e4d3c2b1a0\E}{[R]}g;
s{\QMozilla/5.0 (TrainScan; CanaryBot/2.1; +https://vendor-canary.example)\E}{[R]}g;
s{\Q123456789\E}{[R]}g;
s{\Q4242\E}{[R]}g;
s{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}}{[R-uuid]}g;
s{sk-[A-Za-z0-9-]{16,}}{[R-key]}g;
s{https?://[^\s"]+}{[R-url]}g;
'
