# Attribute resolver cost: raw tables

All times are microseconds per element, the median of 31 samples in one process. r1 and r2 are
the two processes; Δ is r2 − r1. Overheads subtract the same-process baseline, per process.

## Context lines

- class r1: mode=class smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- class r2: mode=class smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- role r1: mode=role smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- role r2: mode=role smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- aria r1: mode=aria smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- aria r2: mode=aria smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- style r1: mode=style smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- style r2: mode=style smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- micro r1: mode=micro smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- micro r2: mode=micro smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- stylesize r1: mode=stylesize smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x5 | console.warn calls: 0
- stylesize r2: mode=stylesize smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x5 | console.warn calls: 0
- setup1 r1: mode=setup1 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup1 r2: mode=setup1 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup4 r1: mode=setup4 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup4 r2: mode=setup4 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup16 r1: mode=setup16 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup16 r2: mode=setup16 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- aria-rerun r1: mode=aria smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- aria-rerun r2: mode=aria smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup1-rerun r1: mode=setup1 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup1-rerun r2: mode=setup1 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup4-rerun r1: mode=setup4 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup4-rerun r2: mode=setup4 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup16-rerun r1: mode=setup16 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0
- setup16-rerun r2: mode=setup16 smoke=false node=v24.22.2 arch=arm64 ngDevMode=true N=1000 createReps=31 refreshSamples=31x30 | console.warn calls: 0

## 1. Main cells

### class

| Scenario           | create r1 |    r2 |     Δ | unchanged r1 |    r2 |     Δ | toggle r1 |    r2 |     Δ |
| ------------------ | --------: | ----: | ----: | -----------: | ----: | ----: | --------: | ----: | ----: |
| 1 plain            |     23.37 | 23.29 | -0.09 |         0.38 |  0.38 | +0.00 |      3.43 |  3.48 | +0.05 |
| 2 explicit         |     37.86 | 39.35 | +1.49 |        10.04 | 10.18 | +0.14 |     14.13 | 14.57 | +0.45 |
| 1' plain (control) |     24.45 | 23.82 | -0.62 |         0.38 |  0.38 | +0.00 |      3.46 |  3.42 | -0.04 |
| 3 auto             |     39.92 | 39.91 | -0.01 |         2.07 |  2.08 | +0.01 |     14.81 | 14.97 | +0.16 |
| 4 off subtree      |     27.86 | 27.55 | -0.31 |         0.52 |  0.53 | +0.01 |      3.79 |  3.76 | -0.03 |

| Overhead                | create r1 |     r2 | unchanged r1 |    r2 | toggle r1 |     r2 |
| ----------------------- | --------: | -----: | -----------: | ----: | --------: | -----: |
| explicit − plain        |    +14.49 | +16.07 |        +9.66 | +9.80 |    +10.70 | +11.10 |
| auto − control          |    +15.47 | +16.08 |        +1.69 | +1.70 |    +11.35 | +11.55 |
| off − control           |     +3.42 |  +3.73 |        +0.14 | +0.15 |     +0.33 |  +0.34 |
| control − plain (drift) |     +1.07 |  +0.54 |        -0.00 | -0.01 |     +0.03 |  -0.06 |

Validation (r1):

- 1 plain: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="h t x y" off="h t x" back="h t x y"
- 2 explicit: resolver calls render=1000 refresh(no change)=1000 refresh(change)=1000 | on="h t x y" off="h t x" back="h t x y"
- 1' plain (control): resolver calls render=1 refresh(no change)=0 refresh(change)=0 | on="h t x y" off="h t x" back="h t x y"
- 3 auto: resolver calls render=1001 refresh(no change)=0 refresh(change)=1000 | on="h t x y" off="h t x" back="h t x y"
- 4 off subtree: resolver calls render=1 refresh(no change)=0 refresh(change)=0 | on="h t x y" off="h t x" back="h t x y"

### role

| Scenario           | create r1 |    r2 |     Δ | unchanged r1 |   r2 |     Δ | toggle r1 |   r2 |     Δ |
| ------------------ | --------: | ----: | ----: | -----------: | ---: | ----: | --------: | ---: | ----: |
| 1 plain            |     21.54 | 20.64 | -0.90 |         0.36 | 0.36 | +0.00 |      3.95 | 3.84 | -0.11 |
| 2 explicit         |     24.53 | 24.16 | -0.37 |         7.14 | 7.69 | +0.54 |      8.14 | 8.65 | +0.51 |
| 1' plain (control) |     22.93 | 22.43 | -0.50 |         0.35 | 0.36 | +0.00 |      3.93 | 3.86 | -0.08 |
| 3 auto             |     30.82 | 30.50 | -0.32 |         4.22 | 4.25 | +0.02 |      9.26 | 9.23 | -0.03 |
| 4 off subtree      |     25.61 | 25.59 | -0.02 |         0.54 | 0.54 | +0.00 |      4.47 | 4.41 | -0.06 |

| Overhead                | create r1 |    r2 | unchanged r1 |    r2 | toggle r1 |    r2 |
| ----------------------- | --------: | ----: | -----------: | ----: | --------: | ----: |
| explicit − plain        |     +2.99 | +3.52 |        +6.78 | +7.32 |     +4.19 | +4.81 |
| auto − control          |     +7.89 | +8.07 |        +3.87 | +3.89 |     +5.32 | +5.37 |
| off − control           |     +2.68 | +3.16 |        +0.19 | +0.19 |     +0.54 | +0.55 |
| control − plain (drift) |     +1.39 | +1.79 |        -0.01 | -0.01 |     -0.01 | +0.02 |

Validation (r1):

- 1 plain: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 2 explicit: resolver calls render=1000 refresh(no change)=1000 refresh(change)=1000 | on="y" off="n" back="y"
- 1' plain (control): resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 3 auto: resolver calls render=1000 refresh(no change)=0 refresh(change)=1000 | on="y" off="n" back="y"
- 4 off subtree: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"

### aria-describedby

| Scenario           | create r1 |    r2 |     Δ | unchanged r1 |   r2 |     Δ | toggle r1 |    r2 |     Δ |
| ------------------ | --------: | ----: | ----: | -----------: | ---: | ----: | --------: | ----: | ----: |
| 1 plain            |     20.99 | 21.40 | +0.41 |         0.35 | 0.14 | -0.21 |      3.74 |  1.75 | -1.99 |
| 2 explicit         |     26.25 | 26.93 | +0.68 |         8.57 | 4.16 | -4.41 |      9.95 |  5.07 | -4.88 |
| 1' plain (control) |     21.11 | 21.53 | +0.42 |         0.35 | 0.36 | +0.00 |      3.80 |  3.91 | +0.11 |
| 3 auto             |     30.30 | 31.42 | +1.12 |         5.15 | 5.17 | +0.02 |      8.59 | 10.59 | +2.00 |
| 4 off subtree      |     25.68 | 24.52 | -1.16 |         0.56 | 0.55 | -0.01 |      4.63 |  4.48 | -0.15 |

| Overhead                | create r1 |    r2 | unchanged r1 |    r2 | toggle r1 |    r2 |
| ----------------------- | --------: | ----: | -----------: | ----: | --------: | ----: |
| explicit − plain        |     +5.26 | +5.53 |        +8.22 | +4.02 |     +6.21 | +3.33 |
| auto − control          |     +9.19 | +9.89 |        +4.80 | +4.81 |     +4.79 | +6.68 |
| off − control           |     +4.57 | +2.98 |        +0.20 | +0.19 |     +0.83 | +0.58 |
| control − plain (drift) |     +0.12 | +0.13 |        +0.00 | +0.21 |     +0.06 | +2.16 |

Validation (r1):

- 1 plain: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 2 explicit: resolver calls render=1000 refresh(no change)=1000 refresh(change)=1000 | on="hx y" off="hx n" back="hx y"
- 1' plain (control): resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 3 auto: resolver calls render=1000 refresh(no change)=0 refresh(change)=1000 | on="hx y" off="hx n" back="hx y"
- 4 off subtree: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"

### style

| Scenario           | create r1 |    r2 |     Δ | unchanged r1 |    r2 |     Δ | toggle r1 |    r2 |     Δ |
| ------------------ | --------: | ----: | ----: | -----------: | ----: | ----: | --------: | ----: | ----: |
| 1 plain            |     25.60 | 24.83 | -0.77 |         0.37 |  0.27 | -0.09 |      4.56 |  4.40 | -0.16 |
| 2 explicit         |     58.42 | 55.65 | -2.77 |        22.58 | 21.97 | -0.61 |     34.57 | 34.43 | -0.14 |
| 1' plain (control) |     25.46 | 25.60 | +0.14 |         0.37 |  0.35 | -0.01 |      4.68 |  4.86 | +0.18 |
| 3 auto             |     60.27 | 60.37 | +0.10 |         5.88 |  6.08 | +0.20 |     34.51 | 34.70 | +0.19 |
| 4 off subtree      |     27.50 | 28.05 | +0.55 |         0.52 |  0.53 | +0.01 |      5.48 |  5.25 | -0.23 |

| Overhead                | create r1 |     r2 | unchanged r1 |     r2 | toggle r1 |     r2 |
| ----------------------- | --------: | -----: | -----------: | -----: | --------: | -----: |
| explicit − plain        |    +32.82 | +30.82 |       +22.21 | +21.70 |    +30.01 | +30.03 |
| auto − control          |    +34.81 | +34.78 |        +5.52 |  +5.73 |    +29.82 | +29.84 |
| off − control           |     +2.04 |  +2.45 |        +0.16 |  +0.18 |     +0.80 |  +0.39 |
| control − plain (drift) |     -0.14 |  +0.77 |        +0.00 |  +0.08 |     +0.12 |  +0.46 |

Validation (r1):

- 1 plain: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="color: red; height: 1px; padding: 4px; width: 10px;" off="color: red; height: 1px; padding: 8px; width: 10px;" back="color: red; height: 1px; padding: 4px; width: 10px;"
- 2 explicit: resolver calls render=1000 refresh(no change)=1000 refresh(change)=1000 | on="color: red; height: 1px; width: 10px; padding: 4px;" off="color: red; height: 1px; width: 10px; padding: 8px;" back="color: red; height: 1px; width: 10px; padding: 4px;"
- 1' plain (control): resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="color: red; height: 1px; padding: 4px; width: 10px;" off="color: red; height: 1px; padding: 8px; width: 10px;" back="color: red; height: 1px; padding: 4px; width: 10px;"
- 3 auto: resolver calls render=1000 refresh(no change)=0 refresh(change)=1000 | on="color: red; height: 1px; width: 10px; padding: 4px;" off="color: red; height: 1px; width: 10px; padding: 8px;" back="color: red; height: 1px; width: 10px; padding: 4px;"
- 4 off subtree: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="color: red; height: 1px; padding: 4px; width: 10px;" off="color: red; height: 1px; padding: 8px; width: 10px;" back="color: red; height: 1px; padding: 4px; width: 10px;"

### aria-rerun

| Scenario           | create r1 |    r2 |      Δ | unchanged r1 |   r2 |     Δ | toggle r1 |   r2 |     Δ |
| ------------------ | --------: | ----: | -----: | -----------: | ---: | ----: | --------: | ---: | ----: |
| 1 plain            |     10.00 | 20.49 | +10.49 |         0.16 | 0.35 | +0.19 |      2.21 | 2.61 | +0.40 |
| 2 explicit         |     12.69 | 26.12 | +13.44 |         6.91 | 6.61 | -0.30 |      8.09 | 8.82 | +0.73 |
| 1' plain (control) |     11.84 | 10.46 |  -1.39 |         0.23 | 0.17 | -0.06 |      2.14 | 3.13 | +0.99 |
| 3 auto             |     17.04 | 15.05 |  -1.99 |         3.74 | 4.28 | +0.54 |     10.22 | 9.43 | -0.79 |
| 4 off subtree      |     15.36 | 12.74 |  -2.61 |         0.41 | 0.54 | +0.14 |      3.51 | 4.41 | +0.90 |

| Overhead                | create r1 |     r2 | unchanged r1 |    r2 | toggle r1 |    r2 |
| ----------------------- | --------: | -----: | -----------: | ----: | --------: | ----: |
| explicit − plain        |     +2.69 |  +5.64 |        +6.75 | +6.26 |     +5.88 | +6.21 |
| auto − control          |     +5.20 |  +4.59 |        +3.51 | +4.11 |     +8.08 | +6.30 |
| off − control           |     +3.52 |  +2.29 |        +0.17 | +0.37 |     +1.38 | +1.28 |
| control − plain (drift) |     +1.85 | -10.03 |        +0.07 | -0.18 |     -0.08 | +0.51 |

Validation (r1):

- 1 plain: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 2 explicit: resolver calls render=1000 refresh(no change)=1000 refresh(change)=1000 | on="hx y" off="hx n" back="hx y"
- 1' plain (control): resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"
- 3 auto: resolver calls render=1000 refresh(no change)=0 refresh(change)=1000 | on="hx y" off="hx n" back="hx y"
- 4 off subtree: resolver calls render=0 refresh(no change)=0 refresh(change)=0 | on="hx" off="n" back="y"

## 2. Hot-path micro-costs

### Lookup per changed binding on an element with a `role` resolver (toggle phase)

Slope = ((resolver k8 − plain k8) − (resolver k1 − plain k1)) / 7: the extra cost of one changed
binding when `tNode.attributeResolvers` holds one entry for another name.

| Binding                         |    r1 |    r2 |
| ------------------------------- | ----: | ----: |
| `[class.x]` (styling.ts lookup) | +0.23 | +0.21 |
| `[attr.x]` (ɵɵattribute lookup) | +0.29 | +0.40 |

| Scenario               | create r1 |    r2 |     Δ | unchanged r1 |   r2 |     Δ | toggle r1 |    r2 |     Δ |
| ---------------------- | --------: | ----: | ----: | -----------: | ---: | ----: | --------: | ----: | ----: |
| class-k1 plain         |      8.63 |  8.76 | +0.13 |         0.26 | 0.25 | -0.00 |      1.47 |  1.52 | +0.04 |
| class-k1 role-resolver |     20.22 | 19.93 | -0.29 |         6.54 | 6.90 | +0.36 |      6.70 |  7.77 | +1.07 |
| class-k8 plain         |     36.05 | 36.56 | +0.51 |         1.53 | 1.54 | +0.01 |     26.01 | 25.29 | -0.72 |
| class-k8 role-resolver |     50.04 | 49.22 | -0.82 |         7.85 | 8.50 | +0.65 |     32.83 | 32.98 | +0.15 |
| attr-k1 plain          |     10.90 | 10.76 | -0.14 |         0.25 | 0.25 | +0.00 |      3.26 |  3.77 | +0.50 |
| attr-k1 role-resolver  |     23.25 | 22.72 | -0.54 |         7.00 | 7.38 | +0.38 |      9.99 | 10.43 | +0.44 |
| attr-k8 plain          |     42.70 | 42.52 | -0.17 |         1.55 | 1.58 | +0.03 |     26.18 | 25.38 | -0.81 |
| attr-k8 role-resolver  |     58.10 | 57.29 | -0.81 |         8.66 | 8.16 | -0.51 |     34.97 | 34.85 | -0.11 |

### Style results of 10 and 100 declarations

| Scenario             | create r1 |     r2 |      Δ | unchanged r1 |     r2 |     Δ | toggle r1 |     r2 |      Δ |
| -------------------- | --------: | -----: | -----: | -----------: | -----: | ----: | --------: | -----: | -----: |
| s10 plain            |     12.47 |  23.27 | +10.80 |         0.15 |   0.23 | +0.08 |      6.16 |   4.56 |  -1.60 |
| s10 explicit         |     46.06 |  76.77 | +30.72 |        31.85 |  35.13 | +3.28 |     50.83 |  43.95 |  -6.89 |
| s100 plain           |     66.01 | 113.35 | +47.34 |         0.28 |   0.28 | -0.00 |     30.71 |  28.33 |  -2.38 |
| s100 explicit        |    520.39 | 532.41 | +12.02 |       286.06 | 276.12 | -9.93 |    335.59 | 332.92 |  -2.68 |
| s10 plain (control)  |     24.10 |  24.30 |  +0.19 |         0.28 |   0.17 | -0.12 |      6.19 |   5.93 |  -0.26 |
| s10 auto             |     83.63 |  80.97 |  -2.66 |        13.75 |   8.11 | -5.64 |     45.91 |  46.90 |  +1.00 |
| s100 plain (control) |    127.51 | 114.11 | -13.39 |         0.28 |   0.14 | -0.14 |     36.73 |  27.46 |  -9.26 |
| s100 auto            |    538.59 | 534.20 |  -4.38 |        85.59 |  81.50 | -4.09 |    345.81 | 330.03 | -15.78 |

| Overhead              | create r1 |      r2 | unchanged r1 |      r2 | toggle r1 |      r2 |
| --------------------- | --------: | ------: | -----------: | ------: | --------: | ------: |
| s10 explicit − plain  |    +33.59 |  +53.50 |       +31.71 |  +34.91 |    +44.67 |  +39.39 |
| s10 auto − control    |    +59.53 |  +56.68 |       +13.47 |   +7.95 |    +39.71 |  +40.98 |
| s100 explicit − plain |   +454.38 | +419.06 |      +285.77 | +275.84 |   +304.88 | +304.58 |
| s100 auto − control   |   +411.08 | +420.09 |       +85.31 |  +81.36 |   +309.09 | +302.57 |

### Automatic setup with 1, 4, and 16 enrolled names (3, 6, and 18 with `class` and `style`)

Elements match a directive and have no source for any enrolled name; one `[attr.data-y]` binding
(not enrolled) toggles. First create = a fresh component class per sample, so the `TView` runs
its first creation pass; the plain first create runs before automatic resolution, in the same
process, not interleaved with auto.

| Names    | Scenario           | first create r1 |    r2 |      Δ | create r1 |    r2 | unchanged r1 |   r2 | toggle r1 |   r2 |
| -------- | ------------------ | --------------: | ----: | -----: | --------: | ----: | -----------: | ---: | --------: | ---: |
| 1        | 1 plain            |           11.06 | 24.99 | +13.93 |      5.81 |  5.68 |         0.10 | 0.24 |      1.35 | 3.05 |
| 1        | 1' plain (control) |             n/a |   n/a |    n/a |     15.21 | 15.20 |         0.14 | 0.25 |      3.40 | 3.19 |
| 1        | 3 auto             |           34.29 | 33.62 |  -0.67 |     21.58 | 22.05 |         0.71 | 0.70 |      3.74 | 3.58 |
| 1        | 4 off subtree      |           30.23 | 28.14 |  -2.09 |     16.39 | 15.91 |         0.38 | 0.39 |      3.25 | 3.25 |
| 4        | 1 plain            |           18.59 | 13.74 |  -4.85 |     14.69 | 14.88 |         0.25 | 0.25 |      3.47 | 3.65 |
| 4        | 1' plain (control) |             n/a |   n/a |    n/a |      7.04 | 15.76 |         0.11 | 0.26 |      3.23 | 3.33 |
| 4        | 3 auto             |           18.86 | 38.93 | +20.07 |     10.23 | 22.55 |         0.67 | 0.85 |      2.24 | 4.27 |
| 4        | 4 off subtree      |           16.90 | 33.84 | +16.94 |      8.93 | 17.79 |         0.45 | 0.33 |      3.74 | 3.78 |
| 16       | 1 plain            |           10.70 | 25.85 | +15.15 |      5.64 | 14.64 |         0.10 | 0.26 |      1.33 | 3.36 |
| 16       | 1' plain (control) |             n/a |   n/a |    n/a |     14.56 | 15.96 |         0.12 | 0.27 |      3.34 | 3.79 |
| 16       | 3 auto             |           53.84 | 56.27 |  +2.43 |     25.54 | 25.82 |         1.25 | 1.77 |      5.79 | 5.77 |
| 16       | 4 off subtree      |           51.27 | 49.67 |  -1.60 |     20.77 | 22.60 |         1.03 | 1.09 |      4.15 | 5.96 |
| 1-rerun  | 1 plain            |           26.12 | 26.20 |  +0.08 |     14.44 | 14.30 |         0.25 | 0.26 |      3.70 | 3.67 |
| 1-rerun  | 1' plain (control) |             n/a |   n/a |    n/a |     15.63 | 15.44 |         0.26 | 0.26 |      3.83 | 3.77 |
| 1-rerun  | 3 auto             |           35.80 | 36.07 |  +0.27 |     21.58 | 21.68 |         0.72 | 0.71 |      4.38 | 4.33 |
| 1-rerun  | 4 off subtree      |           31.43 | 31.08 |  -0.35 |     16.02 | 16.11 |         0.39 | 0.38 |      3.50 | 3.63 |
| 4-rerun  | 1 plain            |           26.41 | 26.28 |  -0.12 |     14.45 | 14.57 |         0.25 | 0.26 |      3.70 | 3.73 |
| 4-rerun  | 1' plain (control) |             n/a |   n/a |    n/a |     16.05 | 16.22 |         0.26 | 0.26 |      3.79 | 3.81 |
| 4-rerun  | 3 auto             |           39.83 | 39.75 |  -0.08 |     22.18 | 22.74 |         0.90 | 0.90 |      4.67 | 4.71 |
| 4-rerun  | 4 off subtree      |           34.39 | 34.70 |  +0.31 |     17.72 | 18.06 |         0.47 | 0.45 |      4.03 | 4.05 |
| 16-rerun | 1 plain            |           26.65 | 26.08 |  -0.58 |     14.56 | 14.38 |         0.25 | 0.25 |      3.79 | 3.69 |
| 16-rerun | 1' plain (control) |             n/a |   n/a |    n/a |     16.84 | 16.43 |         0.26 | 0.26 |      3.92 | 3.80 |
| 16-rerun | 3 auto             |           56.81 | 56.40 |  -0.41 |     26.44 | 26.73 |         1.64 | 1.65 |      5.64 | 5.67 |
| 16-rerun | 4 off subtree      |           49.95 | 50.07 |  +0.13 |     22.21 | 22.70 |         1.09 | 1.03 |      5.40 | 5.62 |

| Names    | first create: auto − plain r1 |     r2 | off − plain r1 |     r2 | create: auto − control r1 |     r2 | unchanged: auto − control r1 |    r2 | toggle: auto − control r1 |    r2 |
| -------- | ----------------------------: | -----: | -------------: | -----: | ------------------------: | -----: | ---------------------------: | ----: | ------------------------: | ----: |
| 1        |                        +23.23 |  +8.63 |         +19.17 |  +3.15 |                     +6.37 |  +6.85 |                        +0.56 | +0.45 |                     +0.34 | +0.39 |
| 4        |                         +0.26 | +25.19 |          -1.70 | +20.10 |                     +3.19 |  +6.79 |                        +0.55 | +0.60 |                     -0.99 | +0.94 |
| 16       |                        +43.15 | +30.42 |         +40.57 | +23.82 |                    +10.98 |  +9.86 |                        +1.14 | +1.51 |                     +2.45 | +1.98 |
| 1-rerun  |                         +9.68 |  +9.87 |          +5.31 |  +4.88 |                     +5.95 |  +6.23 |                        +0.46 | +0.46 |                     +0.55 | +0.56 |
| 4-rerun  |                        +13.43 | +13.47 |          +7.99 |  +8.42 |                     +6.13 |  +6.52 |                        +0.64 | +0.64 |                     +0.88 | +0.89 |
| 16-rerun |                        +30.15 | +30.32 |         +23.30 | +24.00 |                     +9.61 | +10.31 |                        +1.38 | +1.39 |                     +1.72 | +1.87 |

## 3. Memory: LView length of the bench view (N = 1000 elements)

| Mode      | Scenario               | lView.length | (length − baseline) / N |
| --------- | ---------------------- | -----------: | ----------------------: |
| class     | 1 plain                |        15028 |                    0.00 |
| class     | 2 explicit             |        18028 |                    3.00 |
| class     | 1' plain (control)     |        15028 |                    0.00 |
| class     | 3 auto                 |        25028 |                   10.00 |
| class     | 4 off subtree          |        25028 |                   10.00 |
| role      | 1 plain                |        13028 |                    0.00 |
| role      | 2 explicit             |        16028 |                    3.00 |
| role      | 1' plain (control)     |        13028 |                    0.00 |
| role      | 3 auto                 |        28028 |                   15.00 |
| role      | 4 off subtree          |        28028 |                   15.00 |
| aria      | 1 plain                |        13028 |                    0.00 |
| aria      | 2 explicit             |        16028 |                    3.00 |
| aria      | 1' plain (control)     |        13028 |                    0.00 |
| aria      | 3 auto                 |        28028 |                   15.00 |
| aria      | 4 off subtree          |        28028 |                   15.00 |
| style     | 1 plain                |        15028 |                    0.00 |
| style     | 2 explicit             |        18028 |                    3.00 |
| style     | 1' plain (control)     |        15028 |                    0.00 |
| style     | 3 auto                 |        25028 |                   10.00 |
| style     | 4 off subtree          |        25028 |                   10.00 |
| micro     | class-k1 plain         |         3028 |                    0.00 |
| micro     | class-k1 role-resolver |         6028 |                    3.00 |
| micro     | class-k8 plain         |        17028 |                    0.00 |
| micro     | class-k8 role-resolver |        20028 |                    3.00 |
| micro     | attr-k1 plain          |         2028 |                    0.00 |
| micro     | attr-k1 role-resolver  |         5028 |                    3.00 |
| micro     | attr-k8 plain          |         9028 |                    0.00 |
| micro     | attr-k8 role-resolver  |        12028 |                    3.00 |
| stylesize | s10 plain              |        13028 |                    0.00 |
| stylesize | s10 explicit           |        16028 |                    3.00 |
| stylesize | s100 plain             |        13028 |                    0.00 |
| stylesize | s100 explicit          |        16028 |                    3.00 |
| stylesize | s10 plain (control)    |        13028 |                    0.00 |
| stylesize | s10 auto               |        23028 |                   10.00 |
| stylesize | s100 plain (control)   |        13028 |                    0.00 |
| stylesize | s100 auto              |        23028 |                   10.00 |
| setup1    | 1 plain                |        12028 |                    0.00 |
| setup1    | 1' plain (control)     |        12028 |                    0.00 |
| setup1    | 3 auto                 |        27028 |                   15.00 |
| setup1    | 4 off subtree          |        27028 |                   15.00 |
| setup4    | 1 plain                |        12028 |                    0.00 |
| setup4    | 1' plain (control)     |        12028 |                    0.00 |
| setup4    | 3 auto                 |        42028 |                   30.00 |
| setup4    | 4 off subtree          |        42028 |                   30.00 |
| setup16   | 1 plain                |        12028 |                    0.00 |
| setup16   | 1' plain (control)     |        12028 |                    0.00 |
| setup16   | 3 auto                 |       102028 |                   90.00 |
| setup16   | 4 off subtree          |       102028 |                   90.00 |
