---
title: Model Openness Framework (isitopen.ai)
byline: Generative AI Commons, LF AI & Data Foundation (Linux Foundation)
url: https://isitopen.ai
note: The isitopen.ai page in full, plus a summary of the framework from the MOF paper (White et al., 2024, arXiv 2403.13784).
---

## isitopen.ai

### Model Openness Framework (MOF)

The Generative AI Commons at the LF AI & Data Foundation has designed and developed the Model Openness Framework (MOF), a comprehensive system for evaluating and classifying the completeness and openness of machine learning models. This framework assesses which components of the model development lifecycle are publicly released and under what licenses, ensuring an objective evaluation. The framework is constantly evolving. Please participate in the Generative AI Commons to provide feedback and suggestions.

### Model Openness Tool (MOT)

To implement the MOF, we've created the Model Openness Tool (MOT). This tool evaluates each criterion from the MOF and generates a score based on how well each item is met. The MOT provides a practical, user-friendly way to apply the MOF framework to your model and produce a clear, self-service score.

How it works: the MOT presents users with 16 questions about their model. Users need to provide detailed responses for each question. Based on these inputs, the tool calculates a score, classifying the model's openness on a scale of 1, 2, or 3.

Why we developed MOT: our goal in developing the MOT was to offer a straightforward tool for evaluating machine learning models against the MOF framework. This tool helps users understand what components are included with each model and the licenses associated with those components, providing clarity on what can and cannot be done with the model and its parts.

## The framework, from the MOF paper

"The Model Openness Framework: Promoting Completeness and Openness for Reproducibility, Transparency, and Usability in Artificial Intelligence" (Matt White, Ibrahim Haddad, Cailean Osborne, Xiao-Yang Liu, Ahmed Abdelmonsef, Sachin Varghese, Arnaud Le Hors; March 2024, revised October 2024).

Abstract: "Generative artificial intelligence (AI) offers numerous opportunities for research and innovation, but its commercialization has raised concerns about the transparency and safety of frontier AI models. Most models lack the necessary components for full understanding, auditing, and reproducibility, and some model producers use restrictive licenses whilst claiming that their models are 'open source'. To address these concerns, we introduce the Model Openness Framework (MOF), a three-tiered ranked classification system that rates machine learning models based on their completeness and openness, following open science principles." For each MOF class, the paper specifies which code, data and documentation components of the model development lifecycle must be released and under which open licenses.

The three classes, from least to most open:

- **Class III, Open Model.** The model itself is open: architecture, final parameters (weights), inference code, evaluation results, and the model card and data card, under open licenses.
- **Class II, Open Tooling.** Class III plus the code: training code, data preprocessing code, evaluation code and data, supporting libraries and tools, so the model can be retrained and re-evaluated.
- **Class I, Open Science.** Class II plus the science: the training datasets, intermediate checkpoints, the research paper and technical report, and sample outputs, so the work can be fully reproduced and studied.

Components are counted only if released under a license the framework accepts for that kind of artifact (open-source licenses for code, open-data licenses for data, open-content licenses for documentation). A model with downloadable weights under a restrictive license does not reach Class III.
